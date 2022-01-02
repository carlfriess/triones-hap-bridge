const noble = require("@abandonware/noble");
const hap = require("hap-nodejs");

const Accessory = hap.Accessory;
const Characteristic = hap.Characteristic;
const CharacteristicEventTypes = hap.CharacteristicEventTypes;
const Service = hap.Service;

// input: h in [0,360] and s,v in [0,1] - output: r,g,b in [0,1]
function hsv2rgb(h, s, v) {
    let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1)];
}

// Wait for Bluetooth adapter to power on and start scanning
noble.on("stateChange", async (state) => {
    if (state === "poweredOn") {
        await noble.startScanningAsync([], false);
    }
});

noble.on("discover", async (peripheral) => {

    // Check if we just discovered a Triones device
    if (peripheral.advertisement.localName && peripheral.advertisement.localName.startsWith("Triones-")) {

        console.log(`${ peripheral.address } (${ peripheral.advertisement.localName })`);

        // Connect to device and discover the relevant services and characteristics
        await peripheral.connectAsync();
        const {characteristics} = await peripheral.discoverSomeServicesAndCharacteristicsAsync(["ffd0", "ffd5"], ["ffd4", "ffd9"]);
        const ffd4 = characteristics.filter(c => c.uuid === "ffd4")[0];
        const ffd9 = characteristics.filter(c => c.uuid === "ffd9")[0];

        // Define a new accessory
        const accessoryUuid = hap.uuid.generate(peripheral.advertisement.localName);
        const accessory = new Accessory(peripheral.advertisement.localName, accessoryUuid);

        // Define a new service
        const lightService = new Service.Lightbulb("LED Flood Light");

        // Define characteristics for the light service
        const onCharacteristic = lightService.getCharacteristic(Characteristic.On);
        const brightnessCharacteristic = lightService.getCharacteristic(Characteristic.Brightness);
        const hueCharacteristic = lightService.getCharacteristic(Characteristic.Hue);
        const saturationCharacteristic = lightService.getCharacteristic(Characteristic.Saturation);

        let brightness = 100;
        let hue = 0;
        let saturation = 0;

        onCharacteristic.on(CharacteristicEventTypes.GET, callback => {
            ffd4.once("data", state => callback(undefined, state[2] === 0x23));
            ffd9.write(Buffer.from([0xEF, 0x01, 0x77]), false);
        });
        onCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            ffd9.write(Buffer.from([0xCC, value ? 0x23 : 0x24, 0x33]), false, () => callback());
        });

        function setColor(callback) {

            // Check if we should just use white LEDs
            if (saturation <= 5) {
                // Write brightness to device in white mode
                ffd9.write(Buffer.from([0x56, 0xFF, 0xFF, 0xFF, brightness / 100 * 0xFF, 0x0F, 0xAA]), false, () => callback());
            } else {
                // Convert colors to RGB values and write to device
                const [r, g, b] = hsv2rgb(hue, saturation / 100, brightness / 100);
                ffd9.write(Buffer.from([0x56, r * 0xFF, g * 0xFF, b * 0xFF, 0x00, 0xF0, 0xAA]), false, () => callback());
            }
        }

        brightnessCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, brightness));
        brightnessCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            brightness = value;
            setColor(callback);
        });

        hueCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, hue));
        hueCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            hue = value;
            setColor(callback);
        });

        saturationCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, saturation));
        saturationCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            saturation = value;
            setColor(callback);
        });

        // Add the service to the accessory
        accessory.addService(lightService);

        // Publish the accessory
        accessory.publish({
            username: peripheral.address,
            pincode: "123-45-678",
            port: 0,
            category: hap.Categories.LIGHTBULB,
        });

    }

});

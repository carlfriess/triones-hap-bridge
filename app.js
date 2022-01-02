const noble = require("@abandonware/noble");
const hap = require("hap-nodejs");
const mac = require("macaddress");

const Accessory = hap.Accessory;
const Characteristic = hap.Characteristic;
const CharacteristicEventTypes = hap.CharacteristicEventTypes;
const Service = hap.Service;

// input: h in [0,360] and s,v in [0,1] - output: r,g,b in [0,1]
function hsv2rgb(h, s, v) {
    let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1)];
}

// Define a new accessory
const accessoryUuid = hap.uuid.generate("Triones Bridge");
const accessory = new Accessory("Triones Bridge", accessoryUuid);

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

        // Define a new service
        const lightService = new Service.Lightbulb(peripheral.advertisement.localName, peripheral.advertisement.localName);

        // Define characteristics for the light service
        const onCharacteristic = lightService.getCharacteristic(Characteristic.On);
        const brightnessCharacteristic = lightService.getCharacteristic(Characteristic.Brightness);
        const hueCharacteristic = lightService.getCharacteristic(Characteristic.Hue);
        const saturationCharacteristic = lightService.getCharacteristic(Characteristic.Saturation);

        let currentBrightness = 100;
        let targetBrightness = 100;
        let userBrightness = 100;
        let currentHue = 0;
        let targetHue = 0;
        let currentSaturation = 0;
        let targetSaturation = 0;

        function setColor(next) {

            // If a fade is already running do nothing
            if (!next && this.interval) return;

            // Fade towards target color
            const diffBrightness = targetBrightness - currentBrightness;
            currentBrightness += Math.sign(diffBrightness) * Math.min(Math.abs(diffBrightness), 4);
            const diffHue = targetHue - currentHue;
            currentHue += Math.sign(diffHue) * Math.min(Math.abs(diffHue), 4);
            const diffSaturation = targetSaturation - currentSaturation;
            currentSaturation += Math.sign(diffSaturation) * Math.min(Math.abs(diffSaturation), 4);

            // Check if we should just use white LEDs
            if (currentSaturation <= 5) {
                // Write brightness to device in white mode
                ffd9.write(Buffer.from([0x56, 0xFF, 0xFF, 0xFF, currentBrightness / 100 * 0xFF, 0x0F, 0xAA]), true);
            } else {
                // Convert colors to RGB values and write to device
                const [r, g, b] = hsv2rgb(currentHue, currentSaturation / 100, currentBrightness / 100);
                ffd9.write(Buffer.from([0x56, r * 0xFF, g * 0xFF, b * 0xFF, 0x00, 0xF0, 0xAA]), true);
            }

            // Turn off light when brightness is zero
            if (currentBrightness === 0) {
                ffd9.write(Buffer.from([0xCC, 0x24, 0x33]), false);
            }

            if (!this.interval) {
                this.interval = setInterval(() => setColor(true), 20);
            }

            if (diffBrightness === 0 && diffHue === 0 && diffSaturation === 0) {
                clearInterval(this.interval)
                this.interval = null;
            }

        }

        onCharacteristic.on(CharacteristicEventTypes.GET, callback => {
            ffd4.once("data", state => callback(undefined, state[2] === 0x23));
            ffd9.write(Buffer.from([0xEF, 0x01, 0x77]), false);
        });
        onCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            if (value) {
                ffd9.write(Buffer.from([0xCC, 0x23, 0x33]), false, () => callback());
                targetBrightness = userBrightness;
                setColor();
            } else {
                targetBrightness = 0;
                setColor();
                callback();
            }
        });

        brightnessCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, targetBrightness));
        brightnessCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            targetBrightness = userBrightness = value;
            setColor();
            callback();
        });

        hueCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, targetHue));
        hueCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            targetHue = value;
            setColor();
            callback();
        });

        saturationCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, targetSaturation));
        saturationCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            targetSaturation = value;
            setColor();
            callback();
        });

        // Add the service to the accessory
        accessory.addService(lightService);

    }

});

// Get a MAC address from the hardware
mac.one().then(mac => {
    // Publish the accessory
    accessory.publish({
        username: mac,
        pincode: "123-45-678",
        port: 0,
        category: hap.Categories.BRIDGE,
    });
});

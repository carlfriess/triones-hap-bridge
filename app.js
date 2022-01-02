const noble = require("@abandonware/noble");
const hap = require("hap-nodejs");
const mac = require("macaddress");

const Accessory = hap.Accessory;
const Characteristic = hap.Characteristic;
const CharacteristicEventTypes = hap.CharacteristicEventTypes;
const Service = hap.Service;

// input: h in [0,360] and s,v in [0,1] - output: r,g,b in [0,1]
function hsv2rgb(h, s, v) {
    const f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1)];
}

// Class to keep track of all connected accessories
class TrionesLight {

    constructor(name, ffd4, ffd9) {

        this.name = name

        this.ffd4 = ffd4;
        this.ffd9 = ffd9;

        this.service = new Service.Lightbulb(name, name);
        this.currentBrightness = 100;
        this.targetBrightness = 100;
        this.userBrightness = 100;
        this.currentHue = 0;
        this.targetHue = 0;
        this.currentSaturation = 0;
        this.targetSaturation = 0;
        this.interval = null;

        // Define characteristics for the light service
        const onCharacteristic = this.service.getCharacteristic(Characteristic.On);
        const brightnessCharacteristic = this.service.getCharacteristic(Characteristic.Brightness);
        const hueCharacteristic = this.service.getCharacteristic(Characteristic.Hue);
        const saturationCharacteristic = this.service.getCharacteristic(Characteristic.Saturation);

        onCharacteristic.on(CharacteristicEventTypes.GET, callback => {
            this.ffd4.once("data", state => callback(undefined, state[2] === 0x23));
            this.ffd9.write(Buffer.from([0xEF, 0x01, 0x77]), false);
        });
        onCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            if (value) {
                this.ffd9.write(Buffer.from([0xCC, 0x23, 0x33]), false, () => callback());
                this.targetBrightness = this.userBrightness;
                this.setColor();
            } else {
                this.targetBrightness = 0;
                this.setColor();
                callback();
            }
        });

        brightnessCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, this.targetBrightness));
        brightnessCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            this.targetBrightness = this.userBrightness = value;
            this.setColor();
            callback();
        });

        hueCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, this.targetHue));
        hueCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            this.targetHue = value;
            this.setColor();
            callback();
        });

        saturationCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, this.targetSaturation));
        saturationCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            this.targetSaturation = value;
            this.setColor();
            callback();
        });
    }

    setColor(next) {

        // If a fade is already running do nothing
        if (!next && this.interval) return;

        // Fade towards target color
        const diffBrightness = this.targetBrightness - this.currentBrightness;
        this.currentBrightness += Math.sign(diffBrightness) * Math.min(Math.abs(diffBrightness), 4);
        const diffHue = this.targetHue - this.currentHue;
        this.currentHue += Math.sign(diffHue) * Math.min(Math.abs(diffHue), 4);
        const diffSaturation = this.targetSaturation - this.currentSaturation;
        this.currentSaturation += Math.sign(diffSaturation) * Math.min(Math.abs(diffSaturation), 4);

        // Check if we should just use white LEDs
        if (this.currentSaturation <= 5) {
            // Write brightness to device in white mode
            this.ffd9.write(Buffer.from([0x56, 0xFF, 0xFF, 0xFF, this.currentBrightness / 100 * 0xFF, 0x0F, 0xAA]), true);
        } else {
            // Convert colors to RGB values and write to device
            const [r, g, b] = hsv2rgb(this.currentHue, this.currentSaturation / 100, this.currentBrightness / 100);
            this.ffd9.write(Buffer.from([0x56, r * 0xFF, g * 0xFF, b * 0xFF, 0x00, 0xF0, 0xAA]), true);
        }

        // Turn off light when brightness is zero
        if (this.currentBrightness === 0) {
            this.ffd9.write(Buffer.from([0xCC, 0x24, 0x33]), false);
        }

        if (!this.interval) {
            this.interval = setInterval(() => this.setColor(true), 20);
        }

        if (diffBrightness === 0 && diffHue === 0 && diffSaturation === 0) {
            clearInterval(this.interval)
            this.interval = null;
        }
    }
}

// Define a new accessory
const accessoryUuid = hap.uuid.generate("Triones Bridge");
const accessory = new Accessory("Triones Bridge", accessoryUuid);

// Map of known devices and their instances
const lights = {};
const devices = new Set();

// Wait for Bluetooth adapter to power on and start scanning
noble.on("stateChange", async (state) => {
    if (state === "poweredOn") {
        await noble.startScanningAsync([], false);
    }
});

noble.on("discover", async (peripheral) => {

    // Check if we just discovered a Triones device
    const localName = peripheral.advertisement.localName;
    if (localName && localName.startsWith("Triones-")) {

        console.log(`${ peripheral.address } (${ localName })`);

        // If we are already connecting or connected to the device do nothing
        if (devices.has(peripheral.address)) return;

        // Connect to device
        console.log(`${ peripheral.address } CONNECTING...`);
        devices.add(peripheral.address);
        try {
            await peripheral.connectAsync();
        } catch (e) {
            console.log(`${ peripheral.address } CONNECT FAILED`);
            devices.delete(peripheral.address);
            return;
        }
        console.log(`${ peripheral.address } CONNECTED`);

        // Discover the relevant services and characteristics
        let ffd4, ffd9;
        try {
            const {characteristics} = await peripheral.discoverSomeServicesAndCharacteristicsAsync(["ffd0", "ffd5"], ["ffd4", "ffd9"]);
            ffd4 = characteristics.filter(c => c.uuid === "ffd4")[0];
            ffd9 = characteristics.filter(c => c.uuid === "ffd9")[0];
        } catch (e) {
            console.log(`${ peripheral.address } DISCOVERY FAILED`);
            devices.delete(peripheral.address);
            return;
        }

        peripheral.on("disconnect", () => {
            console.log(`${ peripheral.address } DISCONNECTED`);
            devices.delete(peripheral.address);
        });

        // Check if the peripheral has previously been initialized
        if (!lights[localName]) {

            // Initialize peripheral and track it
            const light = lights[localName] = new TrionesLight(localName, ffd4, ffd9);

            // Add the service to the accessory
            accessory.addService(light.service);

        } else {

            // Update characteristic references
            const light = lights[localName];
            light.ffd4 = ffd4;
            light.ffd9 = ffd9;
        }
    }
});

// Always restart scanning for devices
noble.on("scanStop", () => setTimeout(() => {
    console.log("Restarting scan...");
    noble.startScanning([], false);
}, 5000));

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

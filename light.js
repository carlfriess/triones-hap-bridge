const hap = require("hap-nodejs");
const _ = require("lodash");
const {diffHSV} = require("./util");

const Accessory = hap.Accessory;
const Characteristic = hap.Characteristic;
const CharacteristicEventTypes = hap.CharacteristicEventTypes;
const Service = hap.Service;

// Generic HomeKit light that uses HSV color controls
class Light {

    name;
    accessory;
    service;

    currentHSV = [0, 0, 100];   // HSV sent to device
    targetHSV = [0, 0, 100];    // HSV target being faded to
    userHSV = [0, 0, 100];      // HSV input given by user
    targetPower = null;
    enableFade = true;

    constructor(peripheral) {

        this.name = peripheral.advertisement.localName;

        // Define a new accessory
        const accessoryUuid = hap.uuid.generate(peripheral.address);
        this.accessory = new Accessory(this.name, accessoryUuid);

        // Define a new light service
        this.service = new Service.Lightbulb(this.name);

        // Define characteristics for the light service
        const onCharacteristic = this.service.getCharacteristic(Characteristic.On);
        const brightnessCharacteristic = this.service.getCharacteristic(Characteristic.Brightness);
        const hueCharacteristic = this.service.getCharacteristic(Characteristic.Hue);
        const saturationCharacteristic = this.service.getCharacteristic(Characteristic.Saturation);

        onCharacteristic.on(CharacteristicEventTypes.GET, async callback =>
            callback(undefined, await this.getPower()));
        onCharacteristic.on(CharacteristicEventTypes.SET, async (value, callback) => {
            this.targetPower = value;
            this.targetHSV[2] = value ? this.userHSV[2] : 0;
            callback();
        });

        brightnessCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, this.userHSV[2]));
        brightnessCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            this.targetHSV[2] = this.userHSV[2] = value;
            callback();
        });

        hueCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, this.userHSV[0]));
        hueCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            this.targetHSV[0] = this.userHSV[0] = value;
            callback();
        });

        saturationCharacteristic.on(CharacteristicEventTypes.GET, callback => callback(undefined, this.userHSV[1]));
        saturationCharacteristic.on(CharacteristicEventTypes.SET, (value, callback) => {
            this.targetHSV[1] = this.userHSV[1] = value;
            callback();
        });

        // Add the service to the accessory
        this.accessory.addService(this.service);

        // Link to bluetooth peripheral
        this.setPeripheral(peripheral).then(() => {

            // Publish the accessory
            this.accessory.publish({
                username: peripheral.address,
                pincode: "123-45-678",
                port: 0,
                category: hap.Categories.LIGHTBULB,
            });

            console.log(`Published accessory: ${ this.accessory.displayName }`);
        })
    }

    async update() {

        // Do nothing if the current and target colors are identical
        if (typeof this.targetPower !== "boolean" && _.isEqual(this.currentHSV, this.targetHSV)) return false;

        if (this.enableFade) {

            // Fade towards target color
            const rate = 4;
            const diff = diffHSV(this.currentHSV, this.targetHSV).map(v => _.clamp(v, -rate, rate));
            this.currentHSV = this.currentHSV.map((e, i) => e + diff[i]);
            this.currentHSV[0] = ((this.currentHSV[0] % 360) + 360) % 360;  // Wrap around hue values

        } else {

            // Set current color to target color
            this.currentHSV = _.clone(this.targetHSV);

        }

        // Turn on light
        if (this.targetPower === true) {
            this.targetPower = null;
            await this.setPower(true);
        }

        // Set the color of the light
        await this.setColor(...this.currentHSV);

        // Turn off light when brightness is zero
        if (this.targetPower === false && this.currentHSV[2] === 0) {
            this.targetPower = null;
            await this.setPower(false);
        }

        return true;
    }

    // Links this service instance with the given BLE peripheral
    async setPeripheral(peripheral) {
        throw Error("Not Implemented");
    }

    // Returns the power status of the light
    async getPower() {
        throw Error("Not Implemented");
    }

    // Turn the light on or off
    async setPower(on) {
        throw Error("Not Implemented");
    }

    // Set the color of the light using HSV color code
    async setColor(h, s, v) {
        throw Error("Not Implemented");
    }

    // Returns whether a given peripheral is supported
    static supports(peripheral) {
        throw Error("Not Implemented");
    }
}

module.exports = {Light};

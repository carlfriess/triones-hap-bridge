const {Light} = require("./light");
const {hsv2rgb} = require("./util");

class ElkLight extends Light {

    constructor(name) {
        super(name);
        this.power = true;
        this.enableFade = false;
    }

    async setPeripheral(peripheral) {
        const {characteristics} = await peripheral.discoverSomeServicesAndCharacteristicsAsync(["fff0"], ["fff3"]);
        this.fff3 = characteristics.filter(c => c.uuid === "fff3")[0];
    }

    async getPower() {
        return this.power
    }

    async setPower(on) {
        this.power = on;
        await this.fff3.writeAsync(Buffer.from([0x7e, 0x00, 0x04, on, 0x00, 0x00, 0x00, 0x00, 0xef]), false);
    }

    async setColor(h, s, v) {

        // Convert to RGB color space
        const [r, g, b] = hsv2rgb(h, s / 100, 1);

        // Set brightness control
        await this.fff3.writeAsync(Buffer.from([0x7e, 0x00, 0x01, v, 0x00, 0x00, 0x00, 0x00, 0xef]), true);

        // Set RGB color control
        await this.fff3.writeAsync(Buffer.from([0x7e, 0x00, 0x05, 0x03, r * 0xFF, g * 0xFF, b * 0xFF, 0x00, 0xef]), true);

    }

    static supports(peripheral) {
        return peripheral.advertisement.serviceUuids.indexOf("fff0") !== -1;
    }
}

module.exports = {ElkLight};
const noble = require("@abandonware/noble");
const hap = require("hap-nodejs");
const mac = require("macaddress");
const {TrionesLight} = require("./triones-light");
const {ElkLight} = require("./elk-light");

const Accessory = hap.Accessory;

function peripheralSupported(peripheral) {
    return TrionesLight.supports(peripheral) || ElkLight.supports(peripheral);
}

function newLight(peripheral) {
    if (TrionesLight.supports(peripheral)) {
        return new TrionesLight(peripheral.advertisement.localName);
    } else if (ElkLight.supports(peripheral)) {
        return new ElkLight(`${peripheral.advertisement.localName} ${peripheral.address.replace(/:/g, "").toUpperCase()}`);
    } else {
        throw Error("Unsupported peripheral");
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
    if (TrionesLight.supports(peripheral) || ElkLight.supports(peripheral)) {

        const localName = peripheral.advertisement.localName;
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

        peripheral.on("disconnect", () => {
            console.log(`${ peripheral.address } DISCONNECTED`);
            devices.delete(peripheral.address);
        });

        // Check if the peripheral has previously been initialized
        if (!lights[peripheral.address]) {

            // Instantiate a new light service and track it
            let light = lights[peripheral.address] = newLight(peripheral);

            // Link bluetooth peripheral with light
            await lights[peripheral.address].setPeripheral(peripheral);

            // Add the service to the accessory
            accessory.addService(light.service);

        } else {

            // Update peripheral references
            await lights[peripheral.address].setPeripheral(peripheral);
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

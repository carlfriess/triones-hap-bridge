const noble = require("@abandonware/noble");
const {TrionesLight} = require("./triones-light");
const {ElkLight} = require("./elk-light");

function peripheralSupported(peripheral) {
    return TrionesLight.supports(peripheral) || ElkLight.supports(peripheral);
}

function newLight(peripheral) {
    if (TrionesLight.supports(peripheral)) {
        return new TrionesLight(peripheral);
    } else if (ElkLight.supports(peripheral)) {
        return new ElkLight(peripheral);
    } else {
        throw Error("Unsupported peripheral");
    }
}

// Map of known devices and their instances
const lights = {};
const devices = new Set();

// Wait for Bluetooth adapter to power on and start scanning
noble.on("stateChange", async state => {
    if (state === "poweredOn") {
        await noble.startScanningAsync([], false);
    }
});

noble.on("discover", async (peripheral) => {

    // Check if we just discovered a supported device
    if (peripheralSupported(peripheral)) {

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
            lights[peripheral.address] = newLight(peripheral);

        } else {

            // Update peripheral references
            await lights[peripheral.address].setPeripheral(peripheral);
        }
    }
});

// Always restart scanning for devices for the first 60 seconds of execution
const restart = _ => {
    console.log("Restarting scan...");
    noble.startScanning([], false);
};
noble.on("scanStop", restart);
setTimeout(_ => {
    noble.removeListener("scanStop", restart);
    noble.stopScanning();
    console.log("Stopped scanning");
}, 60000);

// Update lights @ 50Hz
setInterval(() => {
    for(const light of Object.values(lights)) {
        light.update();
    }
}, 20);

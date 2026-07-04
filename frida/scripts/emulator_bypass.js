Java.perform(function () {
    Java.use('fr.sephora.aoc2.utils.DeviceUtils').isEmulator.implementation = function () {
        return false;
    };
    console.log('[*] emulator_bypass.js: isEmulator hook OK');
});

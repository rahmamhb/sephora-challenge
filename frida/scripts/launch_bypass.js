Java.perform(function () {
    console.log('[*] launch_bypass.js: installing hooks...');

    // Hook 1: bypass emulator detection
    Java.use('fr.sephora.aoc2.utils.DeviceUtils').isEmulator.implementation = function () {
        return false;
    };

    var ResourcesImpl = Java.use('android.content.res.ResourcesImpl');

    // Hook 2: ResourcesImpl.getValue
    try {
        var origRIGetValue = ResourcesImpl.getValue
            .overload('int', 'android.util.TypedValue', 'boolean');
        origRIGetValue.implementation = function (id, outValue, resolveRefs) {
            try {
                origRIGetValue.call(this, id, outValue, resolveRefs);
            } catch (e) {
                console.log('[*] ResourcesImpl.getValue swallowed 0x' + id.toString(16));
                outValue.type.value = 0;
            }
        };
        console.log('[*] ResourcesImpl.getValue hook OK');
    } catch (e) { console.log('[!] ResourcesImpl.getValue FAILED: ' + e); }

    // Hook 3: ResourcesImpl.getValueForDensity
    try {
        var origRIGetVFD = ResourcesImpl.getValueForDensity
            .overload('int', 'int', 'android.util.TypedValue', 'boolean');
        origRIGetVFD.implementation = function (id, density, outValue, resolveRefs) {
            try {
                origRIGetVFD.call(this, id, density, outValue, resolveRefs);
            } catch (e) {
                console.log('[*] ResourcesImpl.getValueForDensity swallowed 0x' + id.toString(16));
                outValue.type.value = 0;
            }
        };
        console.log('[*] ResourcesImpl.getValueForDensity hook OK');
    } catch (e) { console.log('[!] ResourcesImpl.getValueForDensity FAILED: ' + e); }

    // Hook 4: TypedArray dimension methods
    try {
        var TypedArray = Java.use('android.content.res.TypedArray');

        var origGetDimPxSize = TypedArray.getDimensionPixelSize.overload('int', 'int');
        origGetDimPxSize.implementation = function (index, defValue) {
            try { return origGetDimPxSize.call(this, index, defValue); }
            catch (e) { return defValue; }
        };

        var origGetDim = TypedArray.getDimension.overload('int', 'float');
        origGetDim.implementation = function (index, defValue) {
            try { return origGetDim.call(this, index, defValue); }
            catch (e) { return defValue; }
        };

        var origGetDimPxOff = TypedArray.getDimensionPixelOffset.overload('int', 'int');
        origGetDimPxOff.implementation = function (index, defValue) {
            try { return origGetDimPxOff.call(this, index, defValue); }
            catch (e) { return defValue; }
        };

        var origGetLayoutDimStr = TypedArray.getLayoutDimension.overload('int', 'java.lang.String');
        origGetLayoutDimStr.implementation = function (index, name) {
            try { return origGetLayoutDimStr.call(this, index, name); }
            catch (e) { return -2; }
        };

        console.log('[*] TypedArray dimension hooks OK');
    } catch (e) { console.log('[!] TypedArray dimension hooks FAILED: ' + e); }

    var ColorDrawable = Java.use('android.graphics.drawable.ColorDrawable');
    function emptyDrawable() { return ColorDrawable.$new(0); }

    // Hook 5: android.content.res.Resources.getDrawable
    try {
        var Resources = Java.use('android.content.res.Resources');

        var origResGetDrawable = Resources.getDrawable
            .overload('int', 'android.content.res.Resources$Theme');
        origResGetDrawable.implementation = function (id, theme) {
            try { return origResGetDrawable.call(this, id, theme); }
            catch (e) {
                console.log('[*] Resources.getDrawable swallowed 0x' + id.toString(16));
                return emptyDrawable();
            }
        };

        try {
            var origResGetDrawableNoTheme = Resources.getDrawable.overload('int');
            origResGetDrawableNoTheme.implementation = function (id) {
                try { return origResGetDrawableNoTheme.call(this, id); }
                catch (e) {
                    console.log('[*] Resources.getDrawable(int) swallowed 0x' + id.toString(16));
                    return emptyDrawable();
                }
            };
        } catch (e2) { }

        console.log('[*] Resources.getDrawable hooks OK');
    } catch (e) { console.log('[!] Resources.getDrawable FAILED: ' + e); }

    // Hook 5b: RestringResources (belt-and-suspenders)
    try {
        var RestringResources = Java.use('dev.b3nedikt.restring.internal.RestringResources');
        var origRestringGetDrawable = RestringResources.getDrawable
            .overload('int', 'android.content.res.Resources$Theme');
        origRestringGetDrawable.implementation = function (id, theme) {
            try { return origRestringGetDrawable.call(this, id, theme); }
            catch (e) {
                console.log('[*] RestringResources.getDrawable swallowed 0x' + id.toString(16));
                return emptyDrawable();
            }
        };
        console.log('[*] RestringResources.getDrawable hook OK');
    } catch (e) { console.log('[!] RestringResources.getDrawable FAILED (non-fatal): ' + e); }

    // Hook 6: TypedArray.getDrawableForDensity
    try {
        var origTAGetDrawable = Java.use('android.content.res.TypedArray')
            .getDrawableForDensity.overload('int', 'int');
        origTAGetDrawable.implementation = function (index, density) {
            try { return origTAGetDrawable.call(this, index, density); }
            catch (e) {
                console.log('[*] TypedArray.getDrawableForDensity swallowed idx=' + index);
                return emptyDrawable();
            }
        };
        console.log('[*] TypedArray.getDrawableForDensity hook OK');
    } catch (e) { console.log('[!] TypedArray.getDrawableForDensity FAILED: ' + e); }

    // Hook 7: AppCompatResources.getDrawable
    try {
        var AppCompatResources = Java.use('androidx.appcompat.content.res.AppCompatResources');
        var origACRGetDrawable = AppCompatResources.getDrawable
            .overload('android.content.Context', 'int');
        origACRGetDrawable.implementation = function (ctx, resId) {
            try { return origACRGetDrawable.call(this, ctx, resId); }
            catch (e) {
                console.log('[*] AppCompatResources.getDrawable swallowed 0x' + resId.toString(16));
                return emptyDrawable();
            }
        };
        console.log('[*] AppCompatResources.getDrawable hook OK');
    } catch (e) { console.log('[!] AppCompatResources hook FAILED: ' + e); }

    console.log('[*] launch_bypass.js: all hooks installed.');
});

Java.perform(function () {
    console.log('[*] ssl_bypass.js: installing TLS hooks...');

    // Hook 1: com.android.org.conscrypt.TrustManagerImpl
    // This is Android 11's actual certificate validator — deepest level reachable from Java.
    // Bypassing here means ANY SSL connection will pass, regardless of what cert mitmproxy presents.
    try {
        var ConscryptTMI = Java.use('com.android.org.conscrypt.TrustManagerImpl');
        var Arrays = Java.use('java.util.Arrays');

        // Base X509TrustManager interface overload (used by HttpsURLConnection)
        ConscryptTMI.checkServerTrusted
            .overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String')
            .implementation = function (chain, authType) {
            console.log('[*] Conscrypt.checkServerTrusted(void) bypassed');
        };

        // OkHttp primary path: SSLEngine overload — must return List<X509Certificate>
        try {
            ConscryptTMI.checkServerTrusted
                .overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String', 'javax.net.ssl.SSLEngine')
                .implementation = function (chain, authType, engine) {
                console.log('[*] Conscrypt.checkServerTrusted(SSLEngine) bypassed');
                return Arrays.asList(chain);
            };
        } catch (e2) { console.log('[!] Conscrypt(SSLEngine): ' + e2); }

        // Raw socket path
        try {
            ConscryptTMI.checkServerTrusted
                .overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String', 'java.net.Socket')
                .implementation = function (chain, authType, socket) {
                console.log('[*] Conscrypt.checkServerTrusted(Socket) bypassed');
                return Arrays.asList(chain);
            };
        } catch (e3) { console.log('[!] Conscrypt(Socket): ' + e3); }

        console.log('[*] Conscrypt.TrustManagerImpl hooks OK');
    } catch (e) { console.log('[!] Conscrypt hook FAILED: ' + e); }

    // Hook 2: SSLContext.init — inject trust-all TrustManager at construction time.
    // Covers any SSL context the app creates directly (e.g. Retrofit, custom HTTP clients).
    try {
        var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
        var SSLContext = Java.use('javax.net.ssl.SSLContext');

        var TrustAll = Java.registerClass({
            name: 'fr.bypass.TrustAll',
            implements: [X509TrustManager],
            methods: {
                checkClientTrusted: function (chain, authType) { },
                checkServerTrusted: function (chain, authType) { },
                getAcceptedIssuers: function () { return []; }
            }
        });

        var TMs = Java.array('javax.net.ssl.TrustManager', [TrustAll.$new()]);
        SSLContext.init.overload(
            '[Ljavax.net.ssl.KeyManager;',
            '[Ljavax.net.ssl.TrustManager;',
            'java.security.SecureRandom'
        ).implementation = function (km, tm, sr) {
            this.init(km, TMs, sr);
        };
        console.log('[*] SSLContext.init hook OK');
    } catch (e) { console.log('[!] SSLContext hook FAILED: ' + e); }

    // Hook 3: OkHttp CertificatePinner — app-level cert fingerprint check.
    // Runs AFTER system CA validation passes. The app checks if the cert matches
    // hardcoded fingerprints; this hook makes those checks always pass.
    try {
        Java.use('okhttp3.CertificatePinner')
            .check.overload('java.lang.String', 'java.util.List')
            .implementation = function (host, certs) {
            console.log('[*] CertificatePinner.check bypassed for ' + host);
        };
        console.log('[*] CertificatePinner.check(List) hook OK');
    } catch (e) { console.log('[!] CertificatePinner(List) FAILED: ' + e); }

    try {
        Java.use('okhttp3.CertificatePinner')
            .check.overload('java.lang.String', 'kotlin.jvm.functions.Function0')
            .implementation = function (host, fn) { };
    } catch (e) { }

    // Hook 4: HostnameVerifier — accept all hostnames
    try {
        Java.use('javax.net.ssl.HttpsURLConnection')
            .setDefaultHostnameVerifier.implementation = function (v) { };
    } catch (e) { }

    console.log('[*] ssl_bypass.js: all TLS hooks installed.');
});

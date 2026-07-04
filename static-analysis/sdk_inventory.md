# SDK Inventory — fr.sephora.sephorafrance (v3.14.50)

Identified via static analysis of `base.apk` using JADX 1.5.0.

## Embedded Third-Party SDKs

| SDK | Java Package | Purpose | Network Endpoint(s) | Traffic Interceptable |
|-----|-------------|---------|--------------------|-----------------------|
| AppsFlyer | `com.appsflyer.*` | Mobile attribution / ad campaign tracking | `qdv4ot-launches.appsflyersdk.com`, `qdv4ot-inapps.appsflyersdk.com`, `privacy-sandbox.appsflyersdk.com` | No — native TLS (C++) |
| Batch | `com.batch.android.*` | Push notifications / CRM | `ws.batch.com`, `wsmetrics.batch.com` | Partial — TLS bypassed but body encrypted (`X-Batch-Content-Cipher: 2`) |
| Octopus Community | `com.octopuscommunity.sdk.*` | In-app community / reviews | `api.8pus.io`, `redir.8pus.io` | No — native TLS (C++) |
| TagCommander | `com.tagcommander.lib.*` | Tag management system (TMS) | `cdn.tagcommander.com`, `serverside%d.tagcommander.com` | No — native TLS |
| TrustCommander | `com.tagcommander.lib.consent.*` | GDPR consent management (CMP) | `cdn.trustcommander.net`, `privacy.trustcommander.net` | No — native TLS |
| Dynatrace | `com.dynatrace.agent.*` | Real User Monitoring (RUM) / APM | `bf74432kky.bf.dynatrace.com/mbeacon` | Partial — Java layer intercepted, native layer fails |
| CyberSource Flex | `com.cybersource.flex.android.*` | Payment card tokenization (PCI-DSS) | Not captured (payment flow not tested) | Unknown |

## Direct API Integrations (no embedded SDK)

These endpoints are called directly by Sephora's own code under `fr.sephora.aoc2.*` using Retrofit.

| Service | Purpose | Endpoint(s) | Interceptable |
|---------|---------|------------|---------------|
| Target2Sell | Product recommendations / ranking | `api.target2sell.com`, `reco.target2sell.com`, `serv-api.target2sell.com` | Yes — full visibility |
| Woosmap | Store locator / geocoding | `api.woosmap.com` | Yes — full visibility |

## Sephora's Own Backend

| Endpoint | Purpose |
|----------|---------|
| `apps.sephora.eu` | Main commerce API (products, search, cart, customers) |
| `bf.sephora.fr` | Analytics / beacon |

---

## Notes

- **Flutter embedded**: AppsFlyer is registered as a Flutter plugin (`com.appsflyer.appsflyersdk.AppsflyerSdkPlugin`), indicating the app contains Flutter components alongside native Android code.
- **Dynatrace bytecode instrumentation**: Dynatrace injects monitoring hooks into AndroidX classes at build time (`androidx.core.net.UriCompat`, `androidx.media3.extractor.MpegAudioUtil`). It also instruments `com.cybersource.flex.android.*`, meaning payment flows are monitored by Dynatrace.
- **TrustCommander is a submodule of TagCommander**: Both ship as a single SDK under `com.tagcommander.lib`. TrustCommander handles IAB TCF v2 consent strings.
- **CyberSource class names unobfuscated**: Unlike other SDKs, CyberSource ships with readable class names (`CaptureContext`, `TransientToken`, `FlexException`), generating only 4 JADX warnings vs 12,000+ for the rest of the app.

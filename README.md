# Sephora France — Traffic Interception Research

Analysis of `fr.sephora.sephorafrance` (v3.14.50) for a research challenge.

---

## Prerequisites

Install the following before anything else:

| Tool | Version tested | Install |
|------|---------------|---------|
| Android SDK / `adb` | platform-tools r35 | [developer.android.com](https://developer.android.com/studio/releases/platform-tools) |
| Android Emulator | API 30, x86\_64, 440 dpi | via Android Studio SDK Manager |
| Frida CLI + server | 16.x | `pip install frida-tools` |
| mitmproxy | 10.x | `pip install mitmproxy` |
| JADX | 1.5.0 | [github.com/skylot/jadx/releases](https://github.com/skylot/jadx/releases) |
| Python | 3.10+ | system or pyenv |

---

## Step 1 — Create the Android Emulator

```bash
# Create an AVD (API 30, x86_64, Pixel 4 skin, Google APIs image)
avdmanager create avd \
  -n sephora_research \
  -k "system-images;android-30;google_apis;x86_64" \
  -d pixel_4

# Launch with KVM acceleration
emulator -avd sephora_research -no-audio -no-window -accel on &
adb wait-for-device
```

---

## Step 2 — Obtain and Install the Sephora APK

> **The APK is not included in this repository** (excluded via `.gitignore` to comply with
> Google Play redistribution terms). Obtain it using one of the options below.

### Option A — Install from Google Play, then extract

```bash
# On the emulator, install the app from the Play Store (requires Google account)
# Then extract the installed APK:
adb -s emulator-5554 shell pm path fr.sephora.sephorafrance
# Output: package:/data/app/~~.../fr.sephora.sephorafrance-.../base.apk

adb -s emulator-5554 pull \
  "$(adb -s emulator-5554 shell pm path fr.sephora.sephorafrance | grep base | tr -d '\r' | cut -d: -f2)" \
  apk/original/base.apk
```

### Option B — Install a locally obtained APK

```bash
# If you have base.apk and split_config.x86_64.apk already:
adb -s emulator-5554 install-multiple \
  apk/original/base.apk \
  apk/original/split_config.x86_64.apk
```

> **Version note:** This research was conducted on v3.14.50. The Frida hooks in
> `frida/scripts/launch_bypass.js` target class `fr.sephora.aoc2.utils.DeviceUtils`,
> which may be renamed in later versions.

---

## Step 3 — Install the mitmproxy CA Certificate (system-trusted)

```bash
# On host: generate mitmproxy CA if not already present
mitmdump --version   # any version starts; quit immediately with Ctrl-C

# Compute the legacy subject hash used by Android for CA filenames
HASH=$(openssl x509 -inform PEM -subject_hash_old \
       -in ~/.mitmproxy/mitmproxy-ca-cert.pem | head -1)

# Push as system CA (requires root on emulator)
adb -s emulator-5554 root && adb -s emulator-5554 remount
adb -s emulator-5554 push ~/.mitmproxy/mitmproxy-ca-cert.pem \
    /system/etc/security/cacerts/${HASH}.0
adb -s emulator-5554 shell chmod 644 /system/etc/security/cacerts/${HASH}.0

# Configure system-wide proxy
adb -s emulator-5554 shell settings put global http_proxy 10.0.2.2:8083
```

---

## Step 4 — Push the Frida Server

```bash
# Download frida-server matching your frida-tools version from:
# https://github.com/frida/frida/releases
# Example for API 30 x86_64:
adb -s emulator-5554 push frida/frida-server /data/local/tmp/frida-server
adb -s emulator-5554 shell chmod 755 /data/local/tmp/frida-server

# Start frida-server (run in background)
adb -s emulator-5554 shell "/data/local/tmp/frida-server &"
```

---

## Step 5 — Configure Credentials

> **Required before running the automation script.**

Open [`automation/automate_login.py`](automation/automate_login.py) and set your own
Sephora France account credentials:

```python
EMAIL    = "your.email@example.com"   # your Sephora France account email
PASSWORD = "your_password_here"        # your Sephora France account password
```

The script handles shell-special characters in passwords (e.g., `#`, `$`) automatically
via single-quote escaping; no manual modification is needed for those characters.

---

## Step 6 — Run a Capture Session

### Manual launch

```bash
# Terminal 1: start mitmproxy
mitmdump -p 8083 --flow-detail 2 \
  -w mitmproxy/captures/sephora_$(date +%Y%m%d_%H%M%S).mitm \
  2>&1 | tee mitmproxy/captures/mitm_$(date +%Y%m%d_%H%M%S).log

# Terminal 2: spawn app under Frida
frida -U -f fr.sephora.sephorafrance \
  -l frida/scripts/launch_bypass.js \
  -l frida/scripts/ssl_bypass.js
```

### Automated login (recommended for reproducibility)

```bash
# mitmproxy must already be running (Terminal 1 above)
python3 automation/automate_login.py
```

The script: clears app state → re-spawns under Frida → taps through onboarding → enters
credentials → submits login → polls for post-login UI confirmation.

---

## Step 7 — Inspect Captures

```bash
# Open a saved capture in the mitmweb browser UI
mitmweb -r mitmproxy/captures/sephora_20260627_155816.mitm \
  --set web_port=8091 --mode regular@8092 --no-web-open-browser
# Then open http://127.0.0.1:8091 in a browser
```

---

## Step 8 — Static Analysis

```bash
# Re-extract APK if not already done (Step 2)
# Open in JADX GUI (requires a display; use DISPLAY=:1 on a headless lab machine)
DISPLAY=:1 jadx-gui apk/original/base.apk &
```
---

## Repository Structure

```
sephora-challenge/
├── README.md                        # this file
├── frida/
│   ├── frida-server                 # NOT in git (binary, too large)
│   └── scripts/
│       ├── launch_bypass.js         # emulator detection + resource crash bypass
│       ├── emulator_bypass.js       # standalone emulator detection hook (earlier version)
│       └── ssl_bypass.js            # 3-layer TLS pinning bypass
├── automation/
│   └── automate_login.py            # UIAutomator-based login automation
├── mitmproxy/
│   ├── captures/
│      ├── sephora_*.mitm           # binary capture files 
│      └── mitm_*.log               # plaintext session summaries (
├── static-analysis/
│   ├── sdk_inventory.md             # complete SDK list with Java packages + endpoints
│   ├── findings/
│      ├── appsflyer_flutter.txt    # AppsFlyer Flutter plugin + obfuscated classes
│      ├── cybersource_classes.txt  # CyberSource Flex SDK class listing
│      ├── octopus_buildconfig.txt  # OctopusCommunity hardcoded domain constants
│      └── tagcommander_urls.txt    # TagCommander + TrustCommander hardcoded URLs
└── apk/
    ├── original/
    │   └── base.apk                 # NOT in git — see Step 2 for acquisition
    └── decompiled/                  # NOT in git — regenerate with jadx
---

## Frida Hook Reference

| Script | Hook target | Purpose |
|--------|------------|---------|
| `launch_bypass.js` | `fr.sephora.aoc2.utils.DeviceUtils.isEmulator()` | Force-return `false` to pass emulator check |
| `launch_bypass.js` | `ResourcesImpl`, `TypedArray`, `AppCompatResources` (×5) | Silence `NotFoundException` from missing xxhdpi split |
| `ssl_bypass.js` | `com.android.org.conscrypt.TrustManagerImpl.checkServerTrusted()` (×3 overloads) | Accept any TLS certificate (Layer 1) |
| `ssl_bypass.js` | `javax.net.ssl.SSLContext.init()` | Inject permissive `TrustManager` (Layer 2) |
| `ssl_bypass.js` | `okhttp3.CertificatePinner.check()` + `check$okhttp()` | Skip certificate hash comparison (Layer 3) |

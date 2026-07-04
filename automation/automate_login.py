#!/usr/bin/env python3
"""
automate_login.py — Automated Sephora login via ADB UIAutomator.

Usage:
  python3 automate_login.py

Prerequisites:
  - mitmdump running on port 8083
  - Frida spawning the app (launch_bypass.js + ssl_bypass.js)
  - ADB connected to emulator-5554
"""

import subprocess
import time
import re
import sys
import os
import xml.etree.ElementTree as ET

# ── Config ───────────────────────────────────────────────────────────────────
DEVICE  = "emulator-5554"
PACKAGE = "fr.sephora.sephorafrance"
EMAIL   = "your.email@example.com"   # Replace with your Sephora account email
PASSWORD = "your_password_here"        # Replace with your Sephora account password

_SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "..", "frida", "scripts")
_LAUNCH_SCRIPT = os.path.join(_SCRIPTS_DIR, "launch_bypass.js")
_SSL_SCRIPT    = os.path.join(_SCRIPTS_DIR, "ssl_bypass.js")

_frida_proc = None  # track the background Frida process

# ── ADB helpers ──────────────────────────────────────────────────────────────
def adb(*args):
    return subprocess.run(
        ["adb", "-s", DEVICE] + list(args),
        capture_output=True, text=True
    )

def shell(*args):
    return adb("shell", *args)

def tap(x, y):
    shell("input", "tap", str(x), str(y))
    time.sleep(0.6)

def type_text(text):
    # Single-quote the text so Android shell treats # ; & $ etc. as literals.
    # Embedded single quotes are escaped as '\''
    safe = text.replace("'", "'\\''")
    subprocess.run(
        ["adb", "-s", DEVICE, "shell", f"input text '{safe}'"],
        capture_output=True, text=True
    )
    time.sleep(0.3)

def key(keycode):
    shell("input", "keyevent", keycode)
    time.sleep(0.3)

def clear_field():
    key("KEYCODE_CTRL_A")
    key("KEYCODE_DEL")

# ── UIAutomator helpers ──────────────────────────────────────────────────────
def ui_dump():
    shell("uiautomator", "dump", "/sdcard/ui.xml")
    raw = adb("shell", "cat", "/sdcard/ui.xml").stdout
    return raw if raw.strip() else None

def parse_bounds(s):
    if not s:
        return None
    nums = list(map(int, re.findall(r"\d+", s)))
    return ((nums[0] + nums[2]) // 2, (nums[1] + nums[3]) // 2) if len(nums) == 4 else None

def find_by(xml, text=None, res_id=None, cls=None, desc=None, index=0):
    if not xml:
        return None
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None
    hits = []
    for el in root.iter():
        ok = True
        if text   and el.get("text")          != text:              ok = False
        if res_id and res_id not in (el.get("resource-id") or ""):  ok = False
        if cls    and el.get("class")         != cls:               ok = False
        if desc   and el.get("content-desc")  != desc:              ok = False
        if ok:
            hits.append(parse_bounds(el.get("bounds")))
    return hits[index] if hits and index < len(hits) else None

def find_any(xml, texts):
    for t in texts:
        coord = find_by(xml, text=t)
        if coord:
            return t, coord
    return None, None

def wait_for_text(texts, timeout=25):
    for _ in range(timeout):
        xml = ui_dump()
        label, coord = find_any(xml, texts)
        if coord:
            return label, coord
        time.sleep(1)
    return None, None

# ── Steps ────────────────────────────────────────────────────────────────────
def spawn_with_frida():
    """Re-spawn the app under Frida after pm clear kills the process."""
    global _frida_proc
    print("[*] Re-spawning app with Frida...")
    _frida_proc = subprocess.Popen(
        ["frida", "-U", "-f", PACKAGE,
         "-l", _LAUNCH_SCRIPT,
         "-l", _SSL_SCRIPT],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(5)  # wait for app to boot and hooks to install
    print(f"    Frida PID {_frida_proc.pid} — app spawned.")

def force_logout():
    print("[*] Clearing app data → all sessions wiped...")
    shell("pm", "clear", PACKAGE)
    time.sleep(1)
    print("    Done.")
    spawn_with_frida()

def wait_for_home():
    print("[*] Waiting for app home screen...")
    nav_candidates = ["Accueil", "Beauté", "Catalogue", "Compte", "Panier", "Marques"]
    onboarding_tappable = [
        "Confirm selection", "Confirmer la sélection", "Confirmer",
        "Continuer", "Continue", "Commencer", "Démarrer",
        "Pas maintenant", "IGNORER", "Ignorer", "PASSER",
        "Réessayez", "Réessayer",
        "TOUT ACCEPTER", "Tout accepter",
        "CONNEXION",
    ]
    for _ in range(45):
        xml = ui_dump()
        # Success path 1: main nav bar visible
        label, coord = find_any(xml, nav_candidates)
        if coord:
            print(f"    Home screen ready (found '{label}')")
            return True
        # Success path 2: login form visible (EditText fields present)
        try:
            root = ET.fromstring(xml or "<x/>")
            if any(el.get("class") == "android.widget.EditText" for el in root.iter()):
                print("    Login form ready")
                return True
        except ET.ParseError:
            pass
        # Tap through any onboarding screen
        label, coord = find_any(xml, onboarding_tappable)
        if coord:
            print(f"    [onboarding] Tapping '{label}' at {coord}")
            tap(*coord)
        time.sleep(1)
    print("    [!] Home screen not detected after 45s — is the app running?")
    return False

def go_to_account():
    print("[*] Navigating to account tab...")
    label, coord = wait_for_text(["Compte", "MON COMPTE", "Profil"], timeout=10)
    if coord:
        print(f"    Tapping '{label}' at {coord}")
        tap(*coord)
        time.sleep(2)
        return True
    print("    [!] Account tab not found")
    return False

def tap_login_button():
    print("[*] Looking for login / connect button...")
    login_labels = [
        "Se connecter", "ME CONNECTER", "Connexion",
        "S'identifier", "CONNEXION", "SE CONNECTER"
    ]
    label, coord = wait_for_text(login_labels, timeout=10)
    if coord:
        print(f"    Tapping '{label}' at {coord}")
        tap(*coord)
        time.sleep(2)
        return True
    print("    [!] Login button not found")
    return False

def enter_email():
    print("[*] Entering email...")
    xml = ui_dump()
    coord = find_by(xml, cls="android.widget.EditText", index=0)
    if not coord:
        coord = find_by(xml, res_id="email")
    if not coord:
        print("    [!] Email field not found")
        return False
    print(f"    Tapping field at {coord}")
    tap(*coord)
    clear_field()
    type_text(EMAIL)
    time.sleep(0.5)
    key("KEYCODE_TAB")  # move focus to password field without closing keyboard
    time.sleep(0.5)
    return True

def enter_password():
    print("[*] Entering password...")
    # Focus is already on the password field after KEYCODE_TAB in enter_email().
    # Typing directly is more reliable than finding the field when the soft keyboard
    # is open (which can shift the accessibility tree).
    clear_field()
    type_text(PASSWORD)
    time.sleep(0.5)
    return True

def submit():
    print("[*] Submitting...")
    submit_labels = [
        "Me connecter", "ME CONNECTER", "SE CONNECTER",
        "Valider", "VALIDER", "OK", "Connexion", "Se connecter", "Confirmer"
    ]
    label, coord = wait_for_text(submit_labels, timeout=5)
    if not coord:
        # Soft keyboard may be covering the button — dismiss it (Back hides kb, not nav)
        key("KEYCODE_BACK")
        time.sleep(0.5)
        label, coord = wait_for_text(submit_labels, timeout=5)
    if coord:
        print(f"    Tapping '{label}' at {coord}")
        tap(*coord)
    else:
        print("    Submit button not found — pressing Enter key")
        key("KEYCODE_ENTER")
    time.sleep(3)

def verify_login():
    print("[*] Verifying login...")
    post_login = [
        "Mes commandes", "Mes favoris", "Mon profil",
        "DÉCONNEXION", "Mes avantages", "Carte Sephora"
    ]
    submit_labels = ["Me connecter", "ME CONNECTER", "SE CONNECTER"]
    for attempt in range(4):
        label, coord = wait_for_text(post_login, timeout=10)
        if coord:
            print(f"    Login confirmed — found '{label}'")
            return True
        # Dismiss "L'adresse e-mail et le mot de passe sont incorrects" dialog if present
        label, coord = wait_for_text(["Ok", "OK", "ok"], timeout=6)
        if coord:
            print(f"    [retry {attempt + 1}] Dismissing error dialog...")
            tap(*coord)
            time.sleep(1)
        # Re-tap submit button
        label, coord = wait_for_text(submit_labels, timeout=3)
        if coord:
            print(f"    [retry {attempt + 1}] Tapping '{label}' again...")
            tap(*coord)
            time.sleep(3)
    print("    [?] Could not auto-confirm — check the app screen")
    return False

# ── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print()
    print("=" * 58)
    print("  Sephora Automated Login")
    print("=" * 58)
    print()
    print("  Requires mitmdump running on port 8083.")
    print("  Starting in 3 seconds — press Ctrl+C to abort.")
    print()
    time.sleep(3)

    force_logout()

    if not wait_for_home():
        sys.exit(1)

    xml = ui_dump()
    try:
        root = ET.fromstring(xml or "<x/>")
        already_on_login = any(
            el.get("class") == "android.widget.EditText" for el in root.iter()
        )
    except ET.ParseError:
        already_on_login = False

    if not already_on_login:
        if not go_to_account():
            sys.exit(1)
        if not tap_login_button():
            sys.exit(1)

    if not enter_email():
        sys.exit(1)

    if not enter_password():
        sys.exit(1)

    submit()
    verified = verify_login()

    print()
    if verified:
        print("[+] Automation complete — user is now logged in.")
    else:
        print("[?] Script finished — verify login state in the app.")
    print()

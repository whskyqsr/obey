import subprocess, time, re, os, sys, xml.etree.ElementTree as ET
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
PKG = "me.fealty"
def adb(*a, **k): return subprocess.run(["adb", *a], capture_output=True, **k)
def dump():
    for _ in range(3):
        if _ : anr()
        adb("shell", "uiautomator", "dump", "/sdcard/u.xml"); r = adb("shell", "cat", "/sdcard/u.xml")
        try: return ET.fromstring(r.stdout.decode("utf8", "ignore"))
        except Exception: time.sleep(1)
    return ET.fromstring("<x/>")
def anr():
    # The emulator's launcher sometimes stalls on a cold boot; wave its "isn't responding" dialog away.
    for _ in range(3):
        r = adb("shell", "uiautomator", "dump", "/sdcard/a.xml"); x = adb("shell", "cat", "/sdcard/a.xml").stdout.decode("utf8", "ignore")
        if "isn't responding" not in x: return
        m = re.search(r'text="Wait"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x)
        if m: a, b, c, d = map(int, m.groups()); adb("shell", "input", "tap", str((a + c) // 2), str((b + d) // 2))
        else: adb("shell", "input", "keyevent", "4")
        time.sleep(2)
def center(n):
    x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds"))); return (x1 + x2) // 2, (y1 + y2) // 2
def find(label, desc=False, exact=True):
    # Last match: tabs sit at the bottom, below any same-named chip. A dict, because a leaf Element is falsy.
    hit = None
    for n in dump().iter("node"):
        v = n.get("content-desc" if desc else "text") or ""
        if (v == label) if exact else (label.lower() in v.lower()): hit = dict(n.attrib)
    return hit
def tap(label, desc=False, exact=True, wait=2.5):
    n = find(label, desc, exact) or (find(label, not desc, exact))
    if n is None:
        print("missing", label, [(x.get("text"), x.get("content-desc")) for x in dump().iter("node") if x.get("text") or x.get("content-desc")][-25:]); return False
    x, y = center(n); adb("shell", "input", "tap", str(x), str(y)); time.sleep(wait); return True
def shot(name):
    with open(f"{OUT}/{name}.png", "wb") as f: f.write(adb("exec-out", "screencap", "-p").stdout)
    print("shot", name)
def home():
    adb("shell", "am", "start", "-n", f"{PKG}/app.obey.MainActivity", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER"); time.sleep(3); anr()
    if not find("Today"): adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1"); time.sleep(4)
    tap("Today", wait=1.5)
def back(): adb("shell", "input", "keyevent", "4"); time.sleep(1.5)
def scroll(): adb("shell", "input", "swipe", "540", "1700", "540", "500", "400"); time.sleep(1.2)
def signin(uid):
    adb("shell", "pm", "clear", PKG); adb("shell", "pm", "grant", PKG, "android.permission.POST_NOTIFICATIONS")
    adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1"); time.sleep(8)
    anr(); shot("signin")
    for _ in range(4):
        if find("Dev user id (UUID)", exact=False) or find("Use dev user"): break
        scroll()
    edits = []
    for _ in range(5):
        anr(); edits = [n for n in dump().iter("node") if n.get("class") == "android.widget.EditText"]
        if edits: break
        time.sleep(3)
    x, y = center(edits[-1]); adb("shell", "input", "tap", str(x), str(y)); time.sleep(1)
    adb("shell", "input", "text", uid); time.sleep(1)
    for attempt in range(4):
        n = find("Use dev user")
        if n is None:
            print("no button; texts:", [x.get("text") for x in dump().iter("node") if x.get("text")]); break
        # tap the clickable ancestor's bounds via the node itself
        x, y = center(n); print("tap dev at", x, y, n.get("bounds"))
        adb("shell", "input", "tap", str(x), str(y)); time.sleep(6)
        if not find("Use dev user"): break
        adb("shell", "input", "keyevent", "4"); time.sleep(1.5)
    print("after signin texts:", [x.get("text") for x in dump().iter("node") if x.get("text")][:30])
def run(who, uid):
    signin(uid)
    for _ in range(3):
        if find("Today"): break
        time.sleep(3)
    shot(f"{who}-today"); scroll(); shot(f"{who}-today-2"); scroll(); shot(f"{who}-today-3")
    tap("Today")
    if tap("New", desc=True): shot(f"{who}-plus")
    if tap("Plan", wait=3):
        shot(f"{who}-plan-editor-empty")
        adb("shell", "input", "text", "dinner%swith%sfriends"); time.sleep(1.5)
        shot(f"{who}-plan-editor")
    home()
    tap("Week"); shot(f"{who}-week")
    for d in range(7):
        if tap(str(__import__("datetime").date.today().day + d - 1), wait=1.5): pass
    shot(f"{who}-week-open")
    if tap("Off work", exact=False, wait=3): shot(f"{who}-plan-open")
    if who == "sub":
        home(); tap("Week")
        for _ in range(3):
            if find("Dinner with Jess", exact=False): break
            scroll()
        if tap("Dinner with Jess", exact=False, wait=3): shot("sub-clash")
    home(); tap("Week")
    if tap("Show the month", desc=True): shot(f"{who}-month")
    home(); tap("Us"); shot(f"{who}-us")
    tap("Us")
    if not find("Chastity"): scroll()
    if tap("Chastity", wait=3):
        shot(f"{who}-chastity"); scroll(); shot(f"{who}-chastity-2")
        if who == "dom" and tap("Lock", exact=False, wait=2): shot("dom-lock-sheet")
    home(); tap("Us")
    if tap("Settings", desc=True, wait=3):
        shot(f"{who}-settings")
        if tap("Privacy", wait=3): shot(f"{who}-privacy"); scroll(); shot(f"{who}-privacy-2")
    if who == "sub":
        home()
        if tap("Safe word", desc=True, wait=3):
            shot("sub-safecall")
            if tap("Red", wait=3): shot("sub-safered"); tap("I'm okay now", wait=2)
import traceback
for who, uid in [("sub", "22222222-2222-4222-8222-222222222222"), ("dom", "11111111-1111-4111-8111-111111111111")]:
    try: run(who, uid)
    except Exception: traceback.print_exc()
adb("shell", "uiautomator", "dump", "/sdcard/u.xml"); open(f"{OUT}/last-dump.xml", "wb").write(adb("shell", "cat", "/sdcard/u.xml").stdout)

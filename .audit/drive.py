import subprocess, time, re, os, sys, xml.etree.ElementTree as ET
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
PKG = "me.fealty"
def adb(*a, **k): return subprocess.run(["adb", *a], capture_output=True, **k)
def dump():
    for _ in range(3):
        adb("shell", "uiautomator", "dump", "/sdcard/u.xml"); r = adb("shell", "cat", "/sdcard/u.xml")
        try: return ET.fromstring(r.stdout.decode("utf8", "ignore"))
        except Exception: time.sleep(1)
    return ET.fromstring("<x/>")
def center(n):
    x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds"))); return (x1 + x2) // 2, (y1 + y2) // 2
def find(label, desc=False, exact=True):
    for n in dump().iter("node"):
        v = n.get("content-desc" if desc else "text") or ""
        if (v == label) if exact else (label.lower() in v.lower()): return n
    return None
def tap(label, desc=False, exact=True, wait=2.5):
    n = find(label, desc, exact) or (find(label, not desc, exact))
    if n is None:
        print("missing", label, [(x.get("text"), x.get("content-desc")) for x in dump().iter("node") if x.get("text") or x.get("content-desc")][-25:]); return False
    x, y = center(n); adb("shell", "input", "tap", str(x), str(y)); time.sleep(wait); return True
def shot(name):
    with open(f"{OUT}/{name}.png", "wb") as f: f.write(adb("exec-out", "screencap", "-p").stdout)
    print("shot", name)
def back(): adb("shell", "input", "keyevent", "4"); time.sleep(1.5)
def scroll(): adb("shell", "input", "swipe", "540", "1700", "540", "500", "400"); time.sleep(1.2)
def signin(uid):
    adb("shell", "pm", "clear", PKG); adb("shell", "pm", "grant", PKG, "android.permission.POST_NOTIFICATIONS")
    adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1"); time.sleep(8)
    shot("signin")
    for _ in range(4):
        if find("Dev user id (UUID)", exact=False) or find("Use dev user"): break
        scroll()
    edits = [n for n in dump().iter("node") if n.get("class") == "android.widget.EditText"]
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
US = ["Rules", "Rewards", "Consequences", "Notes", "Journal", "Limits", "Agreement", "Scenes", "Location", "Stats", "Monthly review", "Kits", "All tasks"]
def run(who, uid):
    signin(uid)
    for _ in range(3):
        if find("Today"): break
        time.sleep(3)
    shot(f"{who}-today"); scroll(); shot(f"{who}-today-2"); scroll(); shot(f"{who}-today-3")
    if tap("New", desc=True): shot(f"{who}-plus"); back()
    tap("Today")
    if who == "sub" and tap("More time"): shot(f"{who}-moretime"); back()
    if tap("Drink water"): shot(f"{who}-task-count"); back()
    tap("Week"); shot(f"{who}-week")
    if tap("Show the month", desc=True): shot(f"{who}-month"); back()
    tap("Week")
    if tap("All tasks", desc=True, exact=False): shot(f"{who}-alltasks"); back()
    tap("Us"); shot(f"{who}-us")
    for item in US:
        tap("Us")
        if not find(item):
            scroll()
        if tap(item, wait=3):
            shot(f"{who}-{item.lower().replace(' ', '-')}"); scroll(); shot(f"{who}-{item.lower().replace(' ', '-')}-2"); back()
    tap("Us")
    if tap("Your dynamic", wait=3): shot(f"{who}-dynamic"); scroll(); shot(f"{who}-dynamic-2"); back()
    tap("Us")
    if tap("Settings", desc=True, wait=3): shot(f"{who}-settings"); scroll(); shot(f"{who}-settings-2"); back()
    tap("Us")
    if tap("Rules", wait=3):
        if tap("Protocols", wait=2): shot(f"{who}-protocols")
        back()
    if who == "dom":
        tap("Today")
        if tap("New", desc=True) and tap("Task", wait=3): shot("dom-newtask"); scroll(); shot("dom-newtask-2"); back(); back()
import traceback
for who, uid in [("sub", "22222222-2222-4222-8222-222222222222"), ("dom", "11111111-1111-4111-8111-111111111111")]:
    try: run(who, uid)
    except Exception: traceback.print_exc()
adb("shell", "uiautomator", "dump", "/sdcard/u.xml"); open(f"{OUT}/last-dump.xml", "wb").write(adb("shell", "cat", "/sdcard/u.xml").stdout)

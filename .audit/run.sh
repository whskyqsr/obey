#!/bin/bash
set -x
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell setprop persist.sys.timezone America/Detroit
adb install -r apps/android/app/build/outputs/apk/debug/*.apk
adb shell curl -s -m 5 http://10.0.2.2:3000/health; echo; python3 .audit/drive.py .audit/android-shots 2>&1 | tee .audit/android-shots/drive.log

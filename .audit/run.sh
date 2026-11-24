#!/bin/bash
set -x
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell setprop persist.sys.timezone America/Detroit
adb install -r apps/android/app/build/outputs/apk/debug/*.apk
python3 .audit/drive.py .audit/android-shots

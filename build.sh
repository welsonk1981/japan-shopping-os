#!/usr/bin/env bash
set -e
python3 builder/optimize_images.py
node builder/build.js

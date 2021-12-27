#!/usr/bin/bash
cp autossh.service bridge.service /etc/systemd/system/
systemctl enable autossh.service
systemctl enable bridge.service

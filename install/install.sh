#!/bin/bash
echo "Actualizando dependencias"
sudo apt update -y 
sudo apt upgrade -y 
sudo apt-get install ntp -y 
sudo apt-get install jq -y
sudo apt install ssh autossh 
sudo systemctl enable ssh 
sudo systemctl start ssh
sudo apt install nodejs npm -y
sudo npm install pm2@latest -g -y


#echo "Instalando RS"
#./reverse.sh

#sudo ifconfig eth0 192.168.1.100 netmask 255.255.255.0 up > /dev/null 2>&1
#sudo route add default gw 192.168.1.1 > /dev/null 2>&1
#sudo echo "nameserver 8.8.8.8" > /etc/resolv.conf
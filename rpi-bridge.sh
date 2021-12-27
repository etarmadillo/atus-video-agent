#!/usr/bin/bash

ping -c 1 google.com 2> /dev/null 1> /dev/null
inte=$?

ping -c 1 192.168.1.101 2> /dev/null 1> /dev/null
camu=$?
if [ $inte -eq 0 ] && [ $camu -eq 0 ]
then
	echo "Internet y Cam1"
	exit 0
fi

ping -c 1 192.168.1.102 2> /dev/null 1> /dev/null
camd=$?
if [ $inte -eq 0 ] && [ $camd -eq 0 ]
then
	echo "Internet y Cam2"
	exit 0
fi

ping -c 1 192.168.1.103 2> /dev/null 1> /dev/null
camt=$?
if [ $inte -eq 0 ] && [ $camt -eq 0 ]
then 
	echo "Internet y Cam3"
	exit 0
fi

ping -c 1 192.168.1.104 2> /dev/null 1> /dev/null
camc=$?
if [ $inte -eq 0 ] && [ $camc -eq 0 ]
then 
	echo "Internet y Cam4"
	exit 0
fi


echo "Sin Internet o càmaras"
ifconfig eth0 down 2> /dev/null 1> /dev/null
ifconfig eth1 down 2> /dev/null 1> /dev/null
ifconfig br0 down 2> /dev/null 1> /dev/null
brctl delbr br0 2> /dev/null 1> /dev/null
ifconfig eth0 0.0.0.0 promisc up
ifconfig eth1 0.0.0.0 promisc up

brctl addbr br0
brctl addif br0 eth0
brctl addif br0 eth1

ifconfig br0 192.168.1.111 netmask 255.255.255.0 up
route add default gw 192.168.1.1 dev br0
systemctl restart dhcpcd


cat /sys/class/net/br0/operstate 1> /dev/null 2> /dev/null
	
if [ $? -eq 0 ]
then
	echo "Puente Creado"
	exit 0
else
	echo "Error Creando Puente"
	exit 1
fi

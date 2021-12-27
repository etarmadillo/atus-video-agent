#!/bin/bash

plate=$(cat params.cfg | jq -r .plate)
port=$(cat params.cfg | jq -r .port)

sshPath=/home/pi/.ssh/id_rsa.pub
if [ ! -f $sshPath ]; then
	ssh-keygen -b 2048 -t rsa -f /home/pi/.ssh/id_rsa -q -N ""  
fi
cat $sshPath > $plate.key
cat $sshPath

sshC=255
while [ $sshC -eq 255 ] ; do
   echo "Registra key, y presiona una tecla para continuar."
   read -rsn1
   ssh -o "StrictHostKeyChecking no" -q ubuntu@atus.etarmadillo.com exit 
   sshC=$?
done

echo "Conexion SSH satisfactoria. Registre servicio"

echo "Configurando Reverse en puerto $port"

# sshRs=0
# while [ $sshRs -eq 0 ] ; do
#    pm2 flush  
#    pm2 stop rs 
#    pm2 delete rs 
#    pm2 start "/usr/bin/autossh -N -R 43012:localhost:22 ubuntu@atus.etarmadillo.com" --name rs 
#    pm2 save 
#    pm2 startup 
#    sudo env PATH=$PATH:/usr/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup systemd -u pi --hp /home/pi 
#    sshRs=$(pm2 status rs | grep online -c)
#    [ $sshRs -eq 0 ] && ( echo "Problema al programar reverse shell")
# done
# echo "Ok"

# echo "Matricula $plate"

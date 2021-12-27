nvm install v14.18.1
npm i -g pm2
pm2 install pm2-logrotate
pm2 start .\ecosystem.config.js

/etc/systemd/system/
systemctl enable
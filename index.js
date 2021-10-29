const Camera = require('./camera');


let config = {
  source: "rtsp://admin:Dahua12345@192.168.1.101:554/cam/realmonitor?channel=1&subtype=1",
  destination: "rtmp://192.168.2.1:1935/live/AZJ768_1?sign=4759971206-c5609ed87d97cae8040b3377165209f2"
}

let camUno = new Camera(config);
#!/bin/bash

# Salir inmediatamente si un comando falla
set -e

# --- Configuración (Ajusta según sea necesario) ---
PACKAGE_NAME="atus-video-agent"
# Obtener versión desde package.json
PACKAGE_VERSION=$(node -p "require('./package.json').version")
# Arquitectura de destino (arm64 para Pi 4/5 64-bit, armhf para 32-bit)
ARCHITECTURE="arm64"
MAINTAINER="Departamento TI Armadillo <departamento.ti@etarmadillo.com>" # ¡Cambia esto!
DESCRIPTION="ATUS Video Agent for streaming camera feeds."
# Dependencias (Node.js >= 18 y ffmpeg)
NODE_VERSION_DEP="nodejs (>= 18)"
OTHER_DEPS="ffmpeg"
# Usuario/Grupo que ejecutará el servicio en la Pi
SERVICE_USER="pi"
SERVICE_GROUP="pi"
# Directorio base de instalación
INSTALL_DIR_BASE="/opt"
# Nombre completo del directorio de instalación
APP_INSTALL_DIR="${INSTALL_DIR_BASE}/${PACKAGE_NAME}"
# --- Fin de Configuración ---

# Directorio temporal para construir la estructura del paquete
BUILD_DIR="${PACKAGE_NAME}_deb_build"
# Nombre final del paquete .deb
DEB_FILENAME="${PACKAGE_NAME}_${ARCHITECTURE}.deb"

echo "--- Limpiando entorno anterior ---"
rm -rf "$BUILD_DIR" "$DEB_FILENAME"

echo "--- Creando estructura de directorios para ${PACKAGE_NAME} v${PACKAGE_VERSION} ---"
mkdir -p "${BUILD_DIR}/DEBIAN"
mkdir -p "${BUILD_DIR}${APP_INSTALL_DIR}"
mkdir -p "${BUILD_DIR}${APP_INSTALL_DIR}/public"
mkdir -p "${BUILD_DIR}/lib/systemd/system"

echo "--- Copiando archivos de la aplicación ---"
# Copia los archivos necesarios.
cp index.js "${BUILD_DIR}${APP_INSTALL_DIR}/"
# cp camera.js "${BUILD_DIR}${APP_INSTALL_DIR}/" # Eliminado
cp config.js "${BUILD_DIR}${APP_INSTALL_DIR}/"
cp configLoader.js "${BUILD_DIR}${APP_INSTALL_DIR}/"
cp package.json "${BUILD_DIR}${APP_INSTALL_DIR}/"
cp package-lock.json "${BUILD_DIR}${APP_INSTALL_DIR}/"
cp config.txt "${BUILD_DIR}${APP_INSTALL_DIR}/" # Copiar config.txt base

# Copiar directorio de servicios recursivamente
echo "Copiando directorio services..."
cp -r services/ "${BUILD_DIR}${APP_INSTALL_DIR}/"

# Copiar archivos públicos
echo "Copiando archivos públicos..."
cp public/viewer.html "${BUILD_DIR}${APP_INSTALL_DIR}/public/"

# Si tienes otros archivos/directorios (ej. config, assets), cópialos aquí:
# cp -r assets/ "${BUILD_DIR}${APP_INSTALL_DIR}/"

echo "--- Instalando dependencias de producción dentro de la estructura ---"
# Navega al directorio de la app DENTRO del build dir e instala deps
pushd "${BUILD_DIR}${APP_INSTALL_DIR}" > /dev/null
npm install --production --audit=false --fund=false --loglevel=error
popd > /dev/null # Vuelve al directorio original

echo "--- Creando archivo de servicio systemd ---"
cat << EOF > "${BUILD_DIR}/lib/systemd/system/${PACKAGE_NAME}.service"
[Unit]
Description=${DESCRIPTION}
After=network.target

[Service]
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${APP_INSTALL_DIR}
# Asegúrate que /usr/bin/node es la ruta correcta en las Pis de destino
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=${PACKAGE_NAME}
# Environment="VARIABLE=valor" # Descomenta para añadir variables de entorno

[Install]
WantedBy=multi-user.target
EOF

echo "--- Creando archivo DEBIAN/control ---"
cat << EOF > "${BUILD_DIR}/DEBIAN/control"
Package: ${PACKAGE_NAME}
Version: ${PACKAGE_VERSION}
Architecture: ${ARCHITECTURE}
Maintainer: ${MAINTAINER}
Depends: ${NODE_VERSION_DEP}, ${OTHER_DEPS}
Description: ${DESCRIPTION}
 A Node.js application managed by systemd to stream camera feeds using FFmpeg.
 Installed in ${APP_INSTALL_DIR}.
EOF

echo "--- Creando scripts DEBIAN/postinst, prerm, postrm ---"
# postinst (Después de instalar)
# Usamos EOF sin comillas simples para que las variables de build_deb.sh (${APP_INSTALL_DIR}, etc.) se expandan AHORA.
# Las variables que deben evaluarse en la Pi (como $CONFIG_FILE, $PLATE_NUMBER, $1, etc.) deben escaparse (\\$).
cat << EOF > "${BUILD_DIR}/DEBIAN/postinst"
#!/bin/bash
set -e

# Variables expandidas AHORA por build_deb.sh
APP_INSTALL_DIR="${APP_INSTALL_DIR}"
SERVICE_USER="${SERVICE_USER}"
SERVICE_GROUP="${SERVICE_GROUP}"
CONFIG_FILE="${APP_INSTALL_DIR}/config.txt"
PACKAGE_NAME="${PACKAGE_NAME}"

# --- Línea de depuración (mantenerla por ahora) --- 
echo "DEBUG: CONFIG_FILE is \'\$CONFIG_FILE\'"

config_generated=false
# --- Siempre verificar si config.txt existe y generarlo si falta ---
if [ ! -f "\$CONFIG_FILE" ]; then
    echo "Configuración no encontrada en \$CONFIG_FILE. Generando..."
    if [ -t 0 ]; then
        read -p "Introduce el número de placa para este vehículo: " PLATE_NUMBER

        if [ -z "\$PLATE_NUMBER" ]; then
            echo "Error: El número de placa no puede estar vacío." >&2
            exit 1
        fi

        echo "Generando \$CONFIG_FILE con placa: \$PLATE_NUMBER..."
        cat << EOTXT > "\$CONFIG_FILE"
# Configuration for ATUS Video Agent
loginEndpoint=https://atus.etarmadillo.com/login
streamEndpoint=rtmp://atus.etarmadillo.com:1935/live/
plate=\$PLATE_NUMBER

# Recorder Settings
recording_segment_time=600 # Default to 10 minutes
# recording_output_dir=/mnt/recordings # Example: Uncomment and set if needed

# Sources (parsed by index.js)
source_1_endpoint=rtsp://admin:Dahua12345@192.168.1.101:554/cam/realmonitor?channel=1&subtype=1
source_1_audio=0
source_2_endpoint=rtsp://admin:Dahua12345@192.168.1.102:554/cam/realmonitor?channel=1&subtype=1
source_2_audio=0
source_3_endpoint=rtsp://admin:Dahua12345@192.168.1.103:554/cam/realmonitor?channel=1&subtype=1
source_3_audio=0
source_4_endpoint=rtsp://admin:Dahua12345@192.168.1.104:554/cam/realmonitor?channel=1&subtype=1
source_4_audio=0
EOTXT

        echo "Estableciendo permisos para \$CONFIG_FILE..."
        chown "${SERVICE_USER}:${SERVICE_GROUP}" "\$CONFIG_FILE"
        chmod 640 "\$CONFIG_FILE"
        config_generated=true
    else
        echo "Advertencia: No se puede pedir el número de placa (no hay terminal interactiva)." >&2
        echo "            Crea /opt/atus-video-agent/config.txt manualmente con formato CLAVE=VALOR." >&2
    fi
fi
# --- Fin de la generación de config ---

restart_needed=false
# --- Acciones específicas de configuración/actualización ---
if [ "\$1" = "configure" ] || [ "\$1" = "upgrade" ]; then
    echo "Recargando systemd daemon..."
    systemctl daemon-reload
    echo "Habilitando servicio ${PACKAGE_NAME}..."
    systemctl enable ${PACKAGE_NAME}.service
    restart_needed=true
fi

# Reiniciar si se generó la config O si estamos en configure/upgrade
if [ "\$config_generated" = true ] || [ "\$restart_needed" = true ]; then
    echo "Reiniciando servicio ${PACKAGE_NAME}..."
    systemctl restart ${PACKAGE_NAME}.service || true
fi

exit 0
EOF

# prerm (Antes de quitar)
# Corregido: Usar EOF sin comillas simples, escapar \$1
cat << EOF > "${BUILD_DIR}/DEBIAN/prerm"
#!/bin/bash
set -e
# PACKAGE_NAME es expandido AHORA por build_deb.sh
PACKAGE_NAME="${PACKAGE_NAME}"
# Corregido: Escapar \$1 y usar comillas
if [ "\$1" = "remove" ] || [ "\$1" = "upgrade" ]; then
    echo "Stopping ${PACKAGE_NAME} service..."
    systemctl stop ${PACKAGE_NAME}.service || true
    echo "Disabling ${PACKAGE_NAME} service..."
    systemctl disable ${PACKAGE_NAME}.service || true
fi
exit 0
EOF

# postrm (Después de quitar)
# Corregido: Usar EOF sin comillas simples, escapar \$1
cat << EOF > "${BUILD_DIR}/DEBIAN/postrm"
#!/bin/bash
set -e
# Corregido: Escapar \$1 y usar comillas
if [ "\$1" = "purge" ] || [ "\$1" = "remove" ]; then
     echo "Reloading systemd daemon after removal..."
     systemctl daemon-reload || true
fi
exit 0
EOF

echo "--- Haciendo scripts DEBIAN ejecutables ---"
chmod 0755 "${BUILD_DIR}/DEBIAN/postinst"
chmod 0755 "${BUILD_DIR}/DEBIAN/prerm"
chmod 0755 "${BUILD_DIR}/DEBIAN/postrm"

echo "--- Construyendo el paquete .deb ---"
fakeroot dpkg-deb --build "${BUILD_DIR}" "${DEB_FILENAME}"

echo "--- Limpiando directorio de construcción ---"
rm -rf "${BUILD_DIR}"

echo ""
echo "--- ¡Éxito! Paquete creado: ${DEB_FILENAME} ---"
echo "Puedes subir este archivo a GitHub Releases."
echo "En la Raspberry Pi, descárgalo (ej. con wget) e instálalo con:"
echo "sudo apt update && sudo apt install ./$(basename ${DEB_FILENAME})"
echo ""
echo "Verifica con lintian (opcional): lintian ${DEB_FILENAME}"
# lintian "${DEB_FILENAME}" # Descomenta para ejecutar automáticamente

exit 0
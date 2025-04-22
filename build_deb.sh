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
mkdir -p "${BUILD_DIR}/lib/systemd/system"

echo "--- Copiando archivos de la aplicación ---"
# Copia los archivos necesarios. ¡Asegúrate de incluir todo lo que tu app necesita!
# Excluye node_modules del host, directorios .git, etc.
cp index.js "${BUILD_DIR}${APP_INSTALL_DIR}/"
cp camera.js "${BUILD_DIR}${APP_INSTALL_DIR}/"
cp package.json "${BUILD_DIR}${APP_INSTALL_DIR}/"
cp package-lock.json "${BUILD_DIR}${APP_INSTALL_DIR}/"
# Si tienes otros archivos/directorios (ej. config, assets), cópialos aquí:
cp config.json "${BUILD_DIR}${APP_INSTALL_DIR}/"
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
cat << EOF > "${BUILD_DIR}/DEBIAN/postinst"
#!/bin/bash
set -e
if [ "\$1" = "configure" ]; then
    echo "Reloading systemd daemon..."
    systemctl daemon-reload
    echo "Enabling ${PACKAGE_NAME} service..."
    systemctl enable ${PACKAGE_NAME}.service
    echo "Starting ${PACKAGE_NAME} service..."
    systemctl start ${PACKAGE_NAME}.service || true
fi
exit 0
EOF

# prerm (Antes de quitar)
cat << EOF > "${BUILD_DIR}/DEBIAN/prerm"
#!/bin/bash
set -e
if [ "\$1" = "remove" ] || [ "\$1" = "upgrade" ]; then
    echo "Stopping ${PACKAGE_NAME} service..."
    systemctl stop ${PACKAGE_NAME}.service || true
    echo "Disabling ${PACKAGE_NAME} service..."
    systemctl disable ${PACKAGE_NAME}.service || true
fi
exit 0
EOF

# postrm (Después de quitar)
cat << EOF > "${BUILD_DIR}/DEBIAN/postrm"
#!/bin/bash
set -e
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
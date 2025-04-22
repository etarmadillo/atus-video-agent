# ATUS Video Agent

Este proyecto proporciona un servicio para transmitir streams de video desde fuentes RTSP a destinos RTMP utilizando Node.js y FFmpeg. Está diseñado para ejecutarse como un servicio `systemd` en sistemas basados en Debian, como Raspberry Pi OS.

## Características

*   Consume streams RTSP de cámaras IP.
*   Utiliza FFmpeg para procesar el video (ajuste de bitrate, FPS, resolución).
*   Transmite el video resultante a un servidor RTMP.
*   Gestionado por un script Node.js.
*   Empaquetado como un servicio `systemd` para ejecución en segundo plano y reinicio automático.
*   Optimizado para bajo consumo de datos en redes inestables.

## Prerrequisitos en el Sistema de Destino (Raspberry Pi)

Antes de instalar el paquete `.deb`, el sistema debe tener instalados:

*   **Node.js:** Versión 18 o superior.
*   **FFmpeg:** La herramienta de procesamiento de video.

El proceso de instalación del paquete `.deb` intentará instalar estas dependencias automáticamente si no se encuentran.

## Instalación (Raspberry Pi)

La forma recomendada de instalar `atus-video-agent` es usando el paquete `.deb` proporcionado en las [Releases de GitHub](https://github.com/etarmadillo/atus-video-agent/releases).

1.  **Identifica la última release:** Ve a la [página de Releases](https://github.com/etarmadillo/atus-video-agent/releases) y busca la última versión (ej. `v1.0.0`).
2.  **Copia el enlace del archivo `.deb`:** Encuentra el archivo `.deb` correspondiente a tu arquitectura (ej. `atus-video-agent_arm64.deb` para Raspberry Pi 4/5 de 64 bits), haz clic derecho y copia la dirección del enlace.
3.  **Conéctate a tu Raspberry Pi:** Usa SSH o abre una terminal local.
4.  **Actualiza la lista de paquetes:**
    ```bash
    sudo apt update
    ```
5.  **Descarga el paquete `.deb`:** Reemplaza `<URL_DEL_DEB>` con el enlace que copiaste.
    ```bash
    wget <URL_DEL_DEB>
    ```
    *Ejemplo:*
    ```bash
    wget https://github.com/etarmadillo/atus-video-agent/releases/download/v1.0.0/atus-video-agent_arm64.deb
    ```
6.  **Instala el paquete:** Reemplaza con el nombre del archivo descargado. `apt` instalará `nodejs` y `ffmpeg` si es necesario.
    ```bash
    sudo apt install ./atus-video-agent_arm64.deb
    ```
    Confirma la instalación presionando `Y` cuando se te solicite.

La instalación configurará e iniciará automáticamente el servicio `systemd`.

**(Opcional) Una vez confirmada la instalación, puedes eliminar el archivo `.deb` descargado para liberar espacio:**
```bash
rm ./atus-video-agent_arm64.deb # Reemplaza con el nombre del archivo descargado
```

## Configuración

Actualmente, la configuración de las cámaras (URLs RTSP de origen, URLs RTMP de destino, etc.) se gestiona dentro del archivo `index.js` (o los archivos que este importe, como `camera.js`).

*Para modificar la configuración:* Tendrás que editar los archivos fuente relevantes, reconstruir el paquete `.deb` (ver sección de Desarrollo) y reinstalarlo.

*(Nota: Futuras versiones podrían usar archivos de configuración externos o variables de entorno para una configuración más sencilla).*

## Uso (Gestión del Servicio)

Una vez instalado, el servicio se ejecuta en segundo plano. Puedes gestionarlo usando `systemctl`:

*   **Verificar el estado del servicio:**
    ```bash
    systemctl status atus-video-agent.service
    ```
*   **Ver los logs en tiempo real:**
    ```bash
    sudo journalctl -f -u atus-video-agent.service
    ```
    (Presiona `Ctrl+C` para salir)
*   **Reiniciar el servicio:**
    ```bash
    sudo systemctl restart atus-video-agent.service
    ```
*   **Detener el servicio:**
    ```bash
    sudo systemctl stop atus-video-agent.service
    ```
*   **Iniciar el servicio:**
    ```bash
    sudo systemctl start atus-video-agent.service
    ```

## Desarrollo

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/etarmadillo/atus-video-agent.git
    cd atus-video-agent
    ```
2.  **Instalar dependencias de desarrollo:** (Asegúrate de tener Node.js v18+ y npm/pnpm instalados)
    ```bash
    npm install
    # o pnpm install
    ```
3.  **Ejecutar localmente (para pruebas):** (Necesitarás `ffmpeg` instalado localmente)
    ```bash
    node index.js
    ```
4.  **Construir el paquete `.deb`:**
    Asegúrate de tener las herramientas de empaquetado (`dpkg-dev`, `fakeroot`) instaladas (`sudo apt install dpkg-dev fakeroot build-essential`). Luego, ejecuta el script de construcción:
    ```bash
    ./build_deb.sh
    ```
    O si está configurado en `package.json`:
    ```bash
    npm run build
    # o pnpm build
    ```
    Esto generará el archivo `.deb` en el directorio raíz.

## Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue o un pull request para discutir cambios o mejoras.
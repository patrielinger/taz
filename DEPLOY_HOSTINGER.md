# Despliegue en Hostinger VPS con Ubuntu + Docker

## 1) Preparar la VPS

Conecta a la instancia Ubuntu y ejecuta:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

## 2) Clonar el proyecto

```bash
cd /opt
sudo git clone <URL_DEL_REPO> taz-site
cd taz-site
```

## 3) Configurar variables de entorno

Copia el ejemplo y ajusta los valores reales:

```bash
cp .env.example .env
nano .env
```

Valores mínimos recomendados:

```env
DB_HOST=db
DB_PORT=3306
DB_USER=root
DB_PASSWORD=TuPasswordSegura123
DB_NAME=taz_admin
SESSION_SECRET=una_clave_muy_larga_y_unica
PORT=3000
```

> Importante: usa una contraseña fuerte y guarda `SESSION_SECRET` por separado del repositorio.

## 4) Levantar la aplicación

```bash
docker compose up --build -d
```

Para revisar logs:

```bash
docker compose logs -f app
```

## 5) Verificar funcionamiento

Comprueba la salud de la API:

```bash
curl http://localhost:3000/api/health
```

Respuesta esperada:

```json
{ "ok": true, "message": "TAZ admin API online" }
```

## 6) Exponer el puerto en la VPS

Si Hostinger usa un firewall o un balanceador, abre el puerto 3000 para HTTP/HTTPS o redirige a tu servicio dentro de la VPS.

Opcionalmente puedes usar `nginx` como proxy inverso para exponer la app en `80/443` con SSL.

## 7) Reinicios y respaldos

Para reiniciar:

```bash
docker compose restart
```

Para detener:

```bash
docker compose down
```

Para ver volúmenes de datos:

```bash
docker volume ls
```

Los datos persistentes del MySQL y de uploads quedan en volúmenes Docker y no se pierden al recrear los contenedores.

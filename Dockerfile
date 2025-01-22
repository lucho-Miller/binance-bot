FROM node:18-alpine

# Crear directorio de la aplicación
WORKDIR /usr/src/app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar código fuente
COPY . .

# Comando para ejecutar la aplicación
CMD ["node", "index.js"]

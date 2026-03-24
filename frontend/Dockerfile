FROM node:20-alpine

WORKDIR /app
COPY . .

RUN npm install

ENV NEXT_PUBLIC_API_BASE=/api

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
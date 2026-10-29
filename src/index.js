import app from './app.js';
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`무드픽 실행: http://localhost:${port}`));

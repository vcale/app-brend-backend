console.log('Iniciando servidor...');

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const NodeCache = require('node-cache');
const app = express();

// Configurar CORS para permitir solo el frontend en Vercel
const cors = require('cors');
app.use(cors({
  origin: 'https://app-brend01-iyc5gca3b-samuels-projects-548af230.vercel.app',
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
  credentials: false // No necesitamos cookies, pero lo explicitamos
}));

app.use(express.json());

// Middleware para loguear todas las solicitudes entrantes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} desde ${req.headers.origin || 'desconocido'}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

// Verificación de la clave API de Anthropic
const apiKey = process.env.ANTHROPIC_API_KEY;
console.log('Clave API leída:', apiKey ? 'Definida' : 'No definida');
if (!apiKey) {
  console.error('Error: Clave API de Anthropic no definida en Secrets.');
  process.exit(1);
}

// Inicialización de Anthropic
let anthropic;
try {
  anthropic = new Anthropic({ apiKey });
  console.log('Instancia de Anthropic creada:', anthropic ? 'Éxito' : 'Fallo');
} catch (initError) {
  console.error('Error al inicializar Anthropic:', initError.message);
  process.exit(1);
}

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hora de caché

app.post('/generate', async (req, res) => {
  const {
    platform = '', contentType = '', tone = 'neutral', targetAge = '18-24',
    targetAudience = 'público general', contentGoal = 'entretener',
    region = 'Global', scriptLength = '1min', charLength = '500', topic = ''
  } = req.body;

  // Validación estricta
  if (!platform || !contentType || !topic) {
    console.warn('Faltan campos requeridos:', { platform, contentType, topic });
    return res.status(400).json({
      script: { gancho: "Error", problema: "Error", solucion: "Error", cta: "Error" },
      recommendations: ["Faltan datos requeridos: plataforma, tipo de contenido o tema."],
      viralityScore: 0,
      qualityScore: 0,
      reasons: ["Completa todos los campos obligatorios."]
    });
  }

  const cacheKey = JSON.stringify({ platform, contentType, tone, targetAge, targetAudience, contentGoal, region, scriptLength, charLength, topic });
  const cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    console.log('Usando caché para:', cacheKey);
    return res.json(cachedResult);
  }

  const prompt = `
    Eres un creador de guiones profesional especializado en videos virales para redes sociales. Genera un guión para un ${contentType} en ${platform} sobre "${topic}". Usa un tono ${tone}, dirigido a ${targetAge} años (${targetAudience}, ${region}), con objetivo ${contentGoal}, duración ${scriptLength} y ~${charLength} caracteres. Incluye:
    1. Gancho: Captura la atención al instante.
    2. Problema: Describe un problema relevante.
    3. Solución: Ofrece una solución atractiva.
    4. CTA: Cierra con un llamado persuasivo.
    Optimiza para ${platform} y adapta a ${region}. Devuelve solo un JSON con: script (gancho, problema, solucion, cta), recommendations (3-5), viralityScore (1-10), qualityScore (1-10), reasons (3-5).
  `;

  console.time('Anthropic');
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    console.timeEnd('Anthropic');

    const generatedText = response.content[0].text;
    console.log('Respuesta de Anthropic:', generatedText);

    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No se encontró JSON válido en la respuesta');
    }

    const result = JSON.parse(jsonMatch[0].trim());
    if (!result.script || !result.recommendations || !result.viralityScore || !result.qualityScore || !result.reasons) {
      throw new Error('Respuesta incompleta: faltan claves requeridas');
    }

    cache.set(cacheKey, result);
    console.log('Resultado enviado:', result);
    res.json(result);
  } catch (error) {
    console.error('Error en /generate:', error.stack);
    res.status(500).json({
      script: { gancho: "Error al procesar", problema: "", solucion: "", cta: "" },
      recommendations: ["Intenta de nuevo o revisa tu conexión."],
      viralityScore: 0,
      qualityScore: 0,
      reasons: [`Error: ${error.message}`]
    });
  }
});

// Manejo de errores no capturados
app.use((err, req, res, next) => {
  console.error('Error no capturado:', err.stack);
  res.status(500).json({
    script: { gancho: "Error interno", problema: "", solucion: "", cta: "" },
    recommendations: ["Contacta al soporte si persiste."],
    viralityScore: 0,
    qualityScore: 0,
    reasons: [`Error: ${err.message}`]
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor en puerto ${PORT}`));
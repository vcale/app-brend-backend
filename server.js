console.log('Iniciando servidor...');

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const NodeCache = require('node-cache');
const app = express();

const cors = require('cors');
app.use(cors());

app.use(express.json());

// Verificación de la clave API de Anthropic
console.log('Clave API leída:', process.env.ANTHROPIC_API_KEY ? 'Definida' : 'No definida');
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: Clave API de Anthropic no definida en Secrets.');
  process.exit(1);
}

// Inicialización de Anthropic con validación
let anthropic;
try {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  console.log('Instancia de Anthropic creada:', anthropic ? 'Éxito' : 'Fallo');
} catch (initError) {
  console.error('Error al inicializar Anthropic:', initError.message);
  process.exit(1);
}

const cache = new NodeCache({ stdTTL: 3600 });

app.post('/generate', async (req, res) => {
  console.log('Solicitud recibida:', new Date().toISOString());
  const { platform, contentType, tone, targetAge, targetAudience, contentGoal, region, scriptLength, charLength, topic } = req.body;
  const cacheKey = JSON.stringify({ platform, contentType, tone, targetAge, targetAudience, contentGoal, region, scriptLength, charLength, topic });

  if (!platform || !contentType || !topic) {
    return res.status(400).json({
      script: { gancho: "Error", problema: "Error", solucion: "Error", cta: "Error" },
      recommendations: ["Faltan datos requeridos (plataforma, tipo de contenido o tema)."],
      viralityScore: 0,
      qualityScore: 0,
      reasons: ["Completa todos los campos."],
    });
  }

  const cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    console.log('Usando caché');
    return res.json(cachedResult);
  }

  const prompt = `
    Eres un creador de guiones profesional con experiencia en creación de contenido para redes sociales, específicamente para video con amplia experiencia escribiendo guiones virales y de impacto. Genera un guión altamente profesional y detallado para un ${contentType} en ${platform}, con tono ${tone || 'neutral'}, dirigido a ${targetAge || '18-24'} años de ${targetAudience || 'público general'} en ${region || 'Global'}, que busque ${contentGoal || 'entretener'}, con una duración de ${scriptLength || '1min'} y aproximadamente ${charLength || '500'} caracteres, sobre el tema "${topic}". Ajusta el contenido según las características culturales y de audiencia de ${region}. El guión debe incluir:

    1. **Gancho**: Una introducción impactante para captar la atención inmediatamente.
    2. **Presentación del problema**: Describe un problema relevante para mantener el interés.
    3. **Solución del problema**: Ofrece una solución clara y atractiva.
    4. **CTA (Llamado a la acción)**: Una instrucción corta, específica y persuasiva para cerrar.

    Asegúrate de que el guión sea detallado, adaptado al tipo de contenido (${contentType}) y optimizado para la plataforma (${platform}). Además, proporciona:
    - recommendations: 3-5 recomendaciones específicas para mejorar el impacto.
    - viralityScore: puntuación de viralidad (1-10) con explicación.
    - qualityScore: puntuación de calidad (1-10) con explicación.
    - reasons: 3-5 razones por las que este contenido funcionará.

    Devuelve SOLO un objeto JSON válido con las claves: script (con subsecciones gancho, problema, solucion, cta), recommendations, viralityScore, qualityScore, reasons. No incluyas texto adicional fuera del JSON.
  `;

  console.time('Anthropic');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229', // Modelo corregido
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    console.timeEnd('Anthropic');

    const generatedText = response.content[0].text;
    console.log('Texto generado por Anthropic:', generatedText);

    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No se encontró JSON válido. Texto completo:', generatedText);
      throw new Error('Respuesta de Anthropic no contiene JSON válido');
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0].trim());
    } catch (parseError) {
      console.error('Error al parsear JSON:', parseError.message, 'Texto extraído:', jsonMatch[0]);
      throw new Error('JSON inválido en la respuesta de Anthropic: ' + parseError.message);
    }

    if (!result.script || !result.recommendations || !result.viralityScore || !result.qualityScore || !result.reasons) {
      throw new Error('Respuesta incompleta: faltan claves requeridas');
    }

    cache.set(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error('Error en generate:', error.message);
    res.status(500).json({
      script: { gancho: "Error al procesar", problema: "", solucion: "", cta: "" },
      recommendations: ["Revisa tu conexión o intenta de nuevo."],
      viralityScore: 0,
      qualityScore: 0,
      reasons: [`Error: ${error.message}`],
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor en puerto ${PORT}`));
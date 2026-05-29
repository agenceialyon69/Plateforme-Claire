// ================================================================
// /api/chat — Endpoint du chatbot Claire (côté patient, PUBLIC)
// ----------------------------------------------------------------
// Reçoit les messages du patient, sauvegarde, appelle Claude,
// puis tente d'extraire un résumé qualifié.
//
// 🔐 SÉCURITÉ :
// - CORS restreint aux origines autorisées (env ALLOWED_ORIGINS)
// - Rate-limit basique par IP en mémoire (best-effort)
// - Validation stricte : cabinetId = UUID, taille messages, longueurs
// - Whitelist sur urgence retournée par le LLM
// - Message patient sauvegardé AVANT appel Claude (jamais perdu)
// ================================================================

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin, ok, badRequest, serverError } from './_supabase.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-20250514';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGES = 30;
const MAX_MSG_LEN = 2000;
const URGENCES_VALIDES = new Set(['normale', 'moderee', 'elevee']);

// Rate-limit en mémoire (par instance serverless — best-effort)
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20; // 20 req/min/IP
const rateLimitStore = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const arr = rateLimitStore.get(ip) || [];
  const recent = arr.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitStore.set(ip, recent);
  // Nettoyage occasionnel
  if (rateLimitStore.size > 1000) {
    for (const [k, v] of rateLimitStore) {
      if (v.every(t => now - t > RATE_LIMIT_WINDOW_MS)) rateLimitStore.delete(k);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin || '';
  if (allowed.length === 0 || allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const SYSTEM_PROMPT_BASE = `Tu es Claire, l'assistante de réception en ligne d'un cabinet dentaire.

TON RÔLE :
- Accueillir les patients avec chaleur et professionnalisme.
- Comprendre leur demande en posant des questions simples et utiles.
- Récupérer : leur NOM, leur TÉLÉPHONE, le MOTIF, leur SOUHAIT (RDV rapide, info…), et si possible évaluer l'URGENCE.
- Transmettre clairement les informations au cabinet.

CE QUE TU NE FAIS JAMAIS :
- Tu ne poses AUCUN diagnostic médical.
- Tu ne donnes AUCUN conseil thérapeutique.
- Tu ne prends pas de rendez-vous toi-même : tu transmets au cabinet.
- Pour toute urgence vitale (saignement abondant, douleur très intense + fièvre, traumatisme important), invite immédiatement à appeler le 15.

STYLE :
- Phrases courtes, ton bienveillant, vouvoiement.
- Une question à la fois.
- Toujours rassurant, jamais alarmiste.`;

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return badRequest(res, 'Method not allowed');

  // Rate-limit
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress
          || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans 1 min.' });
  }

  try {
    const { messages, cabinetId, conversationId: existingConvoId } = req.body || {};

    // ---------- VALIDATIONS STRICTES ----------
    if (!cabinetId || typeof cabinetId !== 'string' || !UUID_RE.test(cabinetId)) {
      return badRequest(res, 'cabinetId invalide');
    }
    if (existingConvoId && (typeof existingConvoId !== 'string' || !UUID_RE.test(existingConvoId))) {
      return badRequest(res, 'conversationId invalide');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return badRequest(res, 'messages must be a non-empty array');
    }
    if (messages.length > MAX_MESSAGES) {
      return badRequest(res, `Trop de messages (max ${MAX_MESSAGES})`);
    }
    for (const m of messages) {
      if (!m || typeof m !== 'object') return badRequest(res, 'message invalide');
      if (!['user', 'assistant'].includes(m.role)) return badRequest(res, 'role invalide');
      const c = m.content || m.contenu || '';
      if (typeof c !== 'string' || c.length === 0 || c.length > MAX_MSG_LEN) {
        return badRequest(res, `contenu invalide (max ${MAX_MSG_LEN} chars)`);
      }
    }

    // ---------- LOOKUP CABINET ----------
    const { data: cabinet } = await supabaseAdmin
      .from('cabinets')
      .select('id, nom, telephone, adresse, ville, horaires, regles_reponse')
      .eq('id', cabinetId)
      .single();
    if (!cabinet) return badRequest(res, 'Cabinet introuvable');

    const lastUserMessage = messages[messages.length - 1];
    const lastUserContent = lastUserMessage.content || lastUserMessage.contenu || '';

    // ---------- CRÉATION CONVERSATION SI BESOIN ----------
    let conversationId = existingConvoId;
    if (!conversationId) {
      const { data: newConvo, error: errConvo } = await supabaseAdmin
        .from('conversations')
        .insert({ cabinet_id: cabinetId, statut: 'active', urgence: 'normale' })
        .select('id')
        .single();
      if (errConvo) return serverError(res, errConvo);
      conversationId = newConvo.id;
    } else {
      // Vérifie que la conversation appartient bien à ce cabinet
      const { data: convo } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('cabinet_id', cabinetId)
        .single();
      if (!convo) return badRequest(res, 'Conversation invalide');
    }

    // ---------- SAUVEGARDE DU MESSAGE PATIENT EN PREMIER ----------
    // (avant l'appel Claude pour ne jamais perdre le message du patient)
    if (lastUserMessage.role === 'user') {
      await supabaseAdmin.from('messages').insert({
        conversation_id: conversationId,
        role: 'user',
        contenu: lastUserContent,
      });
    }

    // ---------- APPEL CLAUDE ----------
    const claudeMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content || m.contenu || '',
    }));

    let replyText;
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 600,
        system: buildSystemPrompt(cabinet),
        messages: claudeMessages,
      });
      replyText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
    } catch (err) {
      console.error('Anthropic API error:', err);
      return res.status(502).json({
        error: 'Le service est momentanément indisponible. Réessayez dans un instant.',
        conversationId,
      });
    }

    // ---------- SAUVEGARDE DE LA RÉPONSE ----------
    await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      contenu: replyText,
    });

    // ---------- EXTRACTION DE RÉSUMÉ (async, ne bloque pas la réponse) ----------
    if (claudeMessages.length >= 4) {
      const allMessages = [...claudeMessages, { role: 'assistant', content: replyText }];
      tryExtractSummary(conversationId, cabinetId, allMessages)
        .catch(e => console.error('extractSummary failed:', e));
    }

    return ok(res, { reply: replyText, conversationId });
  } catch (err) {
    return serverError(res, err);
  }
}

// ----------------------------------------------------------------
function buildSystemPrompt(cabinet) {
  let prompt = SYSTEM_PROMPT_BASE;
  prompt += `\n\nINFOS DU CABINET :`;
  prompt += `\n- Nom : ${cabinet.nom}`;
  if (cabinet.ville) prompt += `\n- Ville : ${cabinet.ville}`;
  if (cabinet.adresse) prompt += `\n- Adresse : ${cabinet.adresse}`;
  if (cabinet.telephone) prompt += `\n- Téléphone : ${cabinet.telephone}`;

  if (cabinet.horaires) {
    prompt += `\n\nHORAIRES :`;
    const jours = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
    jours.forEach(j => {
      const d = cabinet.horaires[j];
      if (!d) return;
      if (!d.ouvert) {
        prompt += `\n- ${j} : fermé`;
      } else {
        const m = d.matin?.length ? `${d.matin[0]}–${d.matin[1]}` : '';
        const a = d.aprem?.length ? `${d.aprem[0]}–${d.aprem[1]}` : '';
        prompt += `\n- ${j} : ${[m, a].filter(Boolean).join(' / ')}`;
      }
    });
  }
  if (cabinet.regles_reponse) {
    // Tronque pour éviter qu'un dentiste injecte un prompt énorme
    const regles = String(cabinet.regles_reponse).slice(0, 2000);
    prompt += `\n\nRÈGLES SPÉCIFIQUES DU CABINET :\n${regles}`;
  }
  return prompt;
}

// ----------------------------------------------------------------
async function tryExtractSummary(conversationId, cabinetId, messages) {
  // Idempotence : une seule demande par conversation
  const { data: existing } = await supabaseAdmin
    .from('demandes')
    .select('id')
    .eq('conversation_id', conversationId)
    .limit(1);
  if (existing && existing.length > 0) return;

  const extractionPrompt = `Voici une conversation entre Claire (assistante d'un cabinet dentaire) et un patient. Si tu as suffisamment d'informations, extrais un résumé structuré au format JSON STRICT (aucun texte hors JSON) :

{
  "complet": true,
  "patient_nom": "Nom du patient (ou null)",
  "patient_telephone": "Téléphone (ou null)",
  "motif": "Motif principal en une phrase (ou null)",
  "souhait": "Ce que le patient souhaite (ou null)",
  "urgence": "normale | moderee | elevee"
}

Si tu manques d'informations cruciales (motif ou nom manquants), réponds : { "complet": false }

CRITÈRES D'URGENCE :
- "elevee" : douleur intense, traumatisme, saignement, fièvre, enfant.
- "moderee" : douleur depuis plusieurs jours, gêne notable, abcès.
- "normale" : contrôle, devis, nouveau patient sans urgence.

CONVERSATION :
${messages.map(m => `${m.role === 'user' ? 'PATIENT' : 'CLAIRE'} : ${m.content}`).join('\n')}

Réponds UNIQUEMENT avec le JSON.`;

  let parsed;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: extractionPrompt }],
    });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn('Résumé non extractible:', e.message);
    return;
  }

  if (!parsed || parsed.complet !== true) return;

  // ---------- VALIDATION + SANITIZATION DU JSON LLM ----------
  const urgence = URGENCES_VALIDES.has(parsed.urgence) ? parsed.urgence : 'normale';
  const safe = {
    patient_nom: typeof parsed.patient_nom === 'string' ? parsed.patient_nom.slice(0, 200) : null,
    patient_telephone: typeof parsed.patient_telephone === 'string' ? parsed.patient_telephone.slice(0, 50) : null,
    motif: typeof parsed.motif === 'string' ? parsed.motif.slice(0, 500) : null,
    souhait: typeof parsed.souhait === 'string' ? parsed.souhait.slice(0, 500) : null,
    urgence,
  };
  if (!safe.motif) return; // motif obligatoire

  const { error: errDemande } = await supabaseAdmin
    .from('demandes')
    .insert({
      conversation_id: conversationId,
      cabinet_id: cabinetId,
      ...safe,
      statut: 'en_attente',
    });
  if (errDemande) {
    console.error('Erreur création demande:', errDemande);
    return;
  }

  await supabaseAdmin
    .from('conversations')
    .update({
      patient_nom: safe.patient_nom,
      patient_telephone: safe.patient_telephone,
      motif_resume: safe.motif,
      urgence: safe.urgence,
    })
    .eq('id', conversationId);

  // ---------- WEBHOOK n8n ----------
  if (process.env.N8N_WEBHOOK_URL) {
    const { data: cabinet } = await supabaseAdmin
      .from('cabinets')
      .select('nom, notif_email, notif_telephone')
      .eq('id', cabinetId)
      .single();
    fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'nouvelle_demande',
        cabinet,
        demande: safe,
        conversation_id: conversationId,
      }),
    }).catch(e => console.error('Webhook n8n failed:', e));
  }
}

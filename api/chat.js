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

import { supabaseAdmin, ok, badRequest, serverError } from './_supabase.js';
import { callLLM } from './_llm.js';
import { buildSystemPrompt } from './_prompt.js';
import { detectVitalEmergency, ensureEmergencyNotice, userHasFrenchPhone } from './_safety.js';

// Le moteur conversationnel est fourni par _llm.js (multi-fournisseurs) :
// Groq (gratuit) → Gemini (gratuit) → Anthropic (secours), selon la clé
// présente. On garde une seule interface `callLLM({ system, messages,
// max_tokens, json })` ; plus de dépendance à un fournisseur unique ici.

// Filet de sécurité : retire tout formatage markdown éventuel (gras **, titres #,
// puces -) pour garantir un texte propre dans la bulle de chat.
function stripMarkdown(text) {
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')   // **gras**
    .replace(/\*(.*?)\*/g, '$1')        // *italique*
    .replace(/^#{1,6}\s+/gm, '')        // # titres
    .replace(/^\s*[-•]\s+/gm, '')       // - puces
    .replace(/`{1,3}/g, '')             // `code`
    .trim();
}

// Fournisseurs de modèle de langage autorisés selon le cabinet :
// - cabinet de DÉMO (aucun vrai patient) : cascade complète, offres gratuites incluses ;
// - cabinets RÉELS : uniquement ceux listés dans LLM_PROVIDERS_REAL (défaut : anthropic, offre
//   payante sous contrat de sous-traitance). Jamais d'offre gratuite : leurs conditions peuvent
//   autoriser la réutilisation des messages, or ils peuvent contenir des données de santé.
//   Fail-closed : sans fournisseur autorisé configuré, le chat échoue (et le patient reçoit au
//   minimum la consigne 15/112 en cas d'urgence) plutôt que de basculer en silence.
// Si DEMO_CABINET_ID n'est pas défini, TOUS les cabinets sont traités comme réels.
function providersFor(cabinetId) {
  if (process.env.DEMO_CABINET_ID && cabinetId === process.env.DEMO_CABINET_ID) return null;
  return (process.env.LLM_PROVIDERS_REAL || 'anthropic')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGES = 30;
const MAX_MSG_LEN = 2000;
const URGENCES_VALIDES = new Set(['normale', 'moderee', 'elevee']);

// ----------------------------------------------------------------
// Garde-fous anti-abus (en mémoire, best-effort par instance serverless).
// Double limite : par IP ET par cabinet. Plafonds de taille de requête et
// de longueur de conversation pour borner les coûts.
// NB : pour une vraie montée en charge, brancher un store partagé (Upstash
// Redis) — voir docs/SECURITE.md. La limite mémoire reste un premier filtre.
// ----------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_IP_MAX = 20;        // 20 req/min/IP
const RATE_LIMIT_CABINET_MAX = 60;   // 60 req/min/cabinet (tous patients confondus)
const MAX_TOTAL_CHARS = 12_000;      // somme des contenus d'une même requête
const MAX_CONVO_MESSAGES = 40;       // plafond de messages par conversation (anti-coût)
// Plafonds comptés EN BASE (valables entre instances serverless et en mode minimisation,
// où aucun message n'est stocké : le plafond ci-dessus ne s'y déclenche jamais).
const MAX_CONVO_EXCHANGES = 50;      // échanges par conversation
const NEW_CONVOS_PER_HOUR = 40;      // nouvelles conversations / heure / cabinet réel
const NEW_CONVOS_PER_HOUR_DEMO = 120;// idem pour le cabinet de démo (public)

const rateLimitIp = new Map();
const rateLimitCabinet = new Map();

// Fenêtre glissante générique réutilisable (IP, cabinet…)
function hitLimit(store, key, max) {
  const now = Date.now();
  const recent = (store.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  store.set(key, recent);
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (v.every(t => now - t > RATE_LIMIT_WINDOW_MS)) store.delete(k);
    }
  }
  return recent.length > max;
}

// Retire les caractères de contrôle invisibles (anti-bidouille / exfiltration)
// et normalise l'unicode. Préserve le texte lisible saisi par le patient.
function sanitizeContent(s) {
  const str = String(s == null ? '' : s);
  let out = '';
  for (const ch of str) {
    const c = ch.codePointAt(0);
    // Retire les caractères de contrôle (sauf tab, saut de ligne, retour chariot) et le DEL
    if ((c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) || c === 0x7F) continue;
    out += ch;
  }
  return out.normalize('NFC');
}

// Journalisation structurée des abus (repérable dans les logs Vercel)
function logAbuse(kind, detail) {
  try { console.warn(`[abuse] ${kind}`, JSON.stringify(detail).slice(0, 300)); } catch { /* noop */ }
}

// ----------------------------------------------------------------
// MODE MINIMISATION (RGPD / posture "prise de contact") — ON par défaut.
// Objectif : ne PAS persister de contenu médical dans la base (messages
// détaillés, motif, souhait). On ne garde que le contact + « rappel souhaité »
// + un niveau d'urgence. Le détail complet est transmis AU CABINET via le
// webhook (pass-through), hors de notre base. Réduit fortement l'exposition
// "hébergement de données de santé". Se désactive avec MINIMIZE_HEALTH_DATA=false.
// Le cabinet de DÉMO est exempté (aucun patient réel → on montre la valeur).
// ----------------------------------------------------------------
function minimizeFor(cabinetId) {
  return process.env.MINIMIZE_HEALTH_DATA !== 'false'
    && cabinetId !== process.env.DEMO_CABINET_ID;
}
const MOTIF_MINIMISE = 'Demande de rappel';

// ----------------------------------------------------------------
// Cloudflare Turnstile — anti-abus/anti-bot du chat public.
// OPT-IN : ne s'active QUE si TURNSTILE_SECRET_KEY est défini côté serveur.
// Tant qu'il ne l'est pas, le comportement est inchangé (rien ne casse).
// Une fois activé, le chat du cabinet de DÉMO (UUID public, embarqué dans le
// dépôt = la cible de DoS la plus facile) exige un jeton Turnstile valide.
// Câblage client : voir le commentaire en tête de js/demo-chat.js.
// ----------------------------------------------------------------
function turnstileEnabled() {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

async function verifyTurnstile(token, ip) {
  if (!token || typeof token !== 'string') return false;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const params = new URLSearchParams();
    params.set('secret', process.env.TURNSTILE_SECRET_KEY);
    params.set('response', token);
    if (ip && ip !== 'unknown') params.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    return data.success === true;
  } catch {
    return false; // fail closed : en cas de doute, on refuse.
  } finally {
    clearTimeout(t);
  }
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


export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return badRequest(res, 'Method not allowed');

  // Rate-limit par IP (premier filtre)
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress
          || 'unknown';
  if (hitLimit(rateLimitIp, ip, RATE_LIMIT_IP_MAX)) {
    logAbuse('ip_rate_limit', { ip });
    return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans 1 min.' });
  }

  try {
    // Budget de temps de la requête (maxDuration = 60 s dans vercel.json) : réponse au patient
    // ≤ 30 s, extraction avec le temps restant, ~8 s réservées au webhook. Sans cela, 3
    // fournisseurs en échec + extraction + webhook pouvaient dépasser la durée d'une fonction.
    const tStart = Date.now();
    const { messages, cabinetId, conversationId: existingConvoId, appelRef } = req.body || {};

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
    let totalChars = 0;
    for (const m of messages) {
      if (!m || typeof m !== 'object') return badRequest(res, 'message invalide');
      if (!['user', 'assistant'].includes(m.role)) return badRequest(res, 'role invalide');
      const raw = m.content || m.contenu || '';
      if (typeof raw !== 'string') return badRequest(res, 'contenu invalide');
      const c = sanitizeContent(raw).trim();
      if (c.length === 0 || c.length > MAX_MSG_LEN) {
        return badRequest(res, `contenu invalide (max ${MAX_MSG_LEN} chars)`);
      }
      // Réécrit le contenu assaini pour qu'il soit utilisé partout ensuite
      m.content = c;
      m.contenu = c;
      totalChars += c.length;
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      logAbuse('payload_too_large', { ip, cabinetId, totalChars });
      return badRequest(res, 'Conversation trop longue.');
    }

    // ---------- FILET DÉTERMINISTE (ne dépend d'aucun modèle de langage) ----------
    // Urgence vitale détectée dans N'IMPORTE QUEL message du patient → rappel 15/112
    // garanti dans la réponse + demande classée « élevée » + alerte au cabinet.
    // Numéro de téléphone présent → on tente la demande tout de suite (un patient qui
    // donne son contact puis ferme la page ne doit pas être perdu).
    const userTexts = messages.filter(m => m.role === 'user').map(m => m.content);
    const emergency = userTexts.some(detectVitalEmergency);
    const hasPhone = userTexts.some(userHasFrenchPhone);

    // ---------- LOOKUP CABINET ----------
    const { data: cabinet } = await supabaseAdmin
      .from('cabinets')
      .select('id, nom, telephone, adresse, ville, horaires, regles_reponse')
      .eq('id', cabinetId)
      .single();
    if (!cabinet) return badRequest(res, 'Cabinet introuvable');

    // ---------- ANTI-BOT TURNSTILE (démo publique) ----------
    // Si Turnstile est configuré, le cabinet de démo (UUID public) exige un
    // jeton valide. Ferme le vecteur de DoS financier le plus simple sans
    // gêner les vrais cabinets (qui embarquent leur propre flux).
    if (turnstileEnabled() && process.env.DEMO_CABINET_ID && cabinetId === process.env.DEMO_CABINET_ID) {
      const okTs = await verifyTurnstile(req.body?.turnstileToken, ip);
      if (!okTs) {
        logAbuse('turnstile_failed', { ip, cabinetId });
        return res.status(403).json({ error: 'Vérification anti-robot requise. Rechargez la page et réessayez.' });
      }
    }

    // ---------- RATE-LIMIT PAR CABINET ----------
    if (hitLimit(rateLimitCabinet, cabinetId, RATE_LIMIT_CABINET_MAX)) {
      logAbuse('cabinet_rate_limit', { cabinetId });
      return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans 1 min.' });
    }

    const lastUserMessage = messages[messages.length - 1];
    const lastUserContent = lastUserMessage.content || lastUserMessage.contenu || '';
    const minimize = minimizeFor(cabinetId); // ne pas persister le contenu médical

    // ---------- CRÉATION CONVERSATION SI BESOIN ----------
    let conversationId = existingConvoId;
    let echanges = 0;
    if (!conversationId) {
      // Plafond de nouvelles conversations par heure et par cabinet (compté en base : il
      // tient même si l'attaquant multiplie les instances serverless ou les adresses IP).
      const capNew = cabinetId === process.env.DEMO_CABINET_ID ? NEW_CONVOS_PER_HOUR_DEMO : NEW_CONVOS_PER_HOUR;
      const sinceHour = new Date(Date.now() - 3600_000).toISOString();
      const { count: recentConvos } = await supabaseAdmin
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('cabinet_id', cabinetId)
        .gte('created_at', sinceHour);
      if ((recentConvos || 0) >= capNew) {
        logAbuse('cabinet_new_convo_cap', { cabinetId, recentConvos });
        return res.status(429).json({ error: 'Trop de demandes en ce moment. Réessayez plus tard.' });
      }
      // Traçabilité récupération : si l'appel manqué (appelRef) est fourni ET
      // qu'il appartient bien à CE cabinet, on le relie à la conversation créée.
      // Vérif stricte : sinon un appelRef forgé pollue la mesure d'un autre cabinet.
      let appelId = null;
      if (appelRef && typeof appelRef === 'string' && UUID_RE.test(appelRef)) {
        const { data: appel } = await supabaseAdmin
          .from('appels').select('id, cabinet_id').eq('id', appelRef).single();
        if (appel && appel.cabinet_id === cabinetId) appelId = appel.id;
      }
      const { data: newConvo, error: errConvo } = await supabaseAdmin
        .from('conversations')
        .insert({ cabinet_id: cabinetId, statut: 'active', urgence: 'normale', ...(appelId ? { appel_id: appelId } : {}) })
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

      // Plafond anti-coût : borne la taille d'une même conversation.
      // Au-delà, on clôt poliment plutôt que de laisser filer les coûts.
      const { count } = await supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);
      const { data: ech } = await supabaseAdmin
        .from('conversations').select('nb_echanges').eq('id', conversationId).single();
      echanges = ech && typeof ech.nb_echanges === 'number' ? ech.nb_echanges : 0;
      if ((count || 0) >= MAX_CONVO_MESSAGES || echanges >= MAX_CONVO_EXCHANGES) {
        logAbuse('convo_too_long', { cabinetId, conversationId, count, echanges });
        if (!minimize && lastUserMessage.role === 'user') {
          await supabaseAdmin.from('messages').insert({
            conversation_id: conversationId, role: 'user', contenu: lastUserContent,
          });
        }
        return ok(res, {
          reply: "Je transmets votre demande au cabinet, il vous recontactera rapidement. Prenez soin de vous.",
          conversationId,
        });
      }
    }

    // ---------- SAUVEGARDE DU MESSAGE PATIENT EN PREMIER ----------
    // (avant l'appel Claude pour ne jamais perdre le message du patient)
    // En mode minimisation : on NE persiste PAS le contenu du message (santé).
    if (!minimize && lastUserMessage.role === 'user') {
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
      replyText = await callLLM({
        system: buildSystemPrompt(cabinet),
        messages: claudeMessages,
        max_tokens: 350,
        providers: providersFor(cabinetId),
        budgetMs: 30_000,
      });
      replyText = stripMarkdown(replyText);
      // Filet : jamais de bulle vide renvoyée au patient
      if (!replyText) {
        replyText = "Pour que le cabinet puisse vous recontacter, puis-je avoir votre nom et un numéro où vous joindre ?";
      }
    } catch (err) {
      console.error('LLM API error:', err);
      // Urgence vitale signalée alors que le moteur est en panne : le patient doit QUAND MÊME
      // recevoir la consigne 15/112 (jamais une simple erreur technique).
      if (emergency) {
        await supabaseAdmin.from('conversations').update({ urgence: 'elevee' }).eq('id', conversationId);
        return ok(res, { reply: ensureEmergencyNotice(''), conversationId });
      }
      return res.status(502).json({
        error: 'Le service est momentanément indisponible. Réessayez dans un instant.',
        conversationId,
      });
    }

    // Rappel 15/112 garanti si une urgence vitale a été signalée (même si le modèle l'oublie).
    if (emergency) replyText = ensureEmergencyNotice(replyText);

    // ---------- SAUVEGARDE DE LA RÉPONSE ----------
    // Idem : pas de persistance du fil en mode minimisation.
    if (!minimize) {
      await supabaseAdmin.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        contenu: replyText,
      });
    }

    // ---------- EXTRACTION DE RÉSUMÉ ----------
    // On ATTEND l'extraction avant de répondre. En serverless (Vercel), une
    // promesse non attendue peut être gelée dès la réponse envoyée : la demande
    // qualifiée et le webhook ne partiraient jamais, sans la moindre erreur
    // visible. La demande qualifiée EST le produit — on ne la laisse pas filer.
    // Coût : ~1 à 3 s de latence sur les messages qui déclenchent l'extraction.
    // Elle est bornée par le timeout de 20 s de callLLM et ne bloque jamais
    // la réponse patient (échec avalé proprement).
    // Compteur d'échanges + horodatage côté base. Indispensable en mode minimisation : aucun
    // message n'est stocké, donc le déclencheur sur `messages` ne met jamais à jour l'activité.
    await supabaseAdmin
      .from('conversations')
      .update({ nb_echanges: echanges + 1, derniere_activite: new Date().toISOString() })
      .eq('id', conversationId);

    // Urgence vitale : la demande existante monte à « élevée » (jamais l'inverse) et le cabinet
    // est alerté. Indépendant de l'extraction : l'urgence peut survenir après la création.
    if (emergency) {
      try {
        await upgradeUrgence(conversationId, cabinetId);
      } catch (e) {
        console.error('upgradeUrgence failed:', e);
      }
    }

    if (claudeMessages.length >= 4 || hasPhone) {
      const allMessages = [...claudeMessages, { role: 'assistant', content: replyText }];
      try {
        await tryExtractSummary(conversationId, cabinetId, allMessages, {
          emergency, budgetMs: Math.max(0, 47_000 - (Date.now() - tStart)),
        });
      } catch (e) {
        console.error('extractSummary failed:', e);
      }
    }

    return ok(res, { reply: replyText, conversationId });
  } catch (err) {
    return serverError(res, err);
  }
}

// ----------------------------------------------------------------

// ----------------------------------------------------------------
async function tryExtractSummary(conversationId, cabinetId, messages, { emergency = false, budgetMs = 45_000 } = {}) {
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
    const text = (await callLLM({
      messages: [{ role: 'user', content: extractionPrompt }],
      max_tokens: 400,
      json: true,
      providers: providersFor(cabinetId),
      budgetMs,
    })).trim();
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn('Résumé non extractible:', e.message);
    return;
  }

  if (!parsed || parsed.complet !== true) return;

  // ---------- VALIDATION + SANITIZATION DU JSON LLM ----------
  // Urgence vitale détectée par le filet déterministe : prioritaire sur le jugement du modèle.
  const urgence = emergency ? 'elevee' : (URGENCES_VALIDES.has(parsed.urgence) ? parsed.urgence : 'normale');
  const safe = {
    patient_nom: typeof parsed.patient_nom === 'string' ? parsed.patient_nom.slice(0, 200) : null,
    patient_telephone: typeof parsed.patient_telephone === 'string' ? parsed.patient_telephone.slice(0, 50) : null,
    motif: typeof parsed.motif === 'string' ? parsed.motif.slice(0, 500) : null,
    souhait: typeof parsed.souhait === 'string' ? parsed.souhait.slice(0, 500) : null,
    urgence,
  };
  const minimize = minimizeFor(cabinetId);
  // Condition de création de la demande :
  //  - mode normal : il faut un motif.
  //  - mode minimisation : il faut au moins un contact (nom ou téléphone) pour
  //    rappeler ; le motif médical n'est PAS requis ni stocké.
  const hasContact = !!(safe.patient_nom || safe.patient_telephone);
  if (minimize ? !hasContact : !safe.motif) return;

  // Ce qui est RÉELLEMENT écrit en base. En minimisation : contact + urgence +
  // motif générique, jamais le détail médical (motif/souhait réels).
  const dbDemande = minimize
    ? {
        patient_nom: safe.patient_nom, patient_telephone: safe.patient_telephone,
        motif: MOTIF_MINIMISE, souhait: null, urgence: safe.urgence,
      }
    : { ...safe };

  const { error: errDemande } = await supabaseAdmin
    .from('demandes')
    .insert({
      conversation_id: conversationId,
      cabinet_id: cabinetId,
      ...dbDemande,
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
      motif_resume: minimize ? MOTIF_MINIMISE : safe.motif,
      urgence: safe.urgence,
    })
    .eq('id', conversationId);

  await notifyWebhook(cabinetId, 'nouvelle_demande', { demande: safe, conversation_id: conversationId });
}

// ----------------------------------------------------------------
// Urgence vitale signalée : monte la demande (et la conversation) à « élevée » — jamais à la
// baisse — puis prévient le cabinet. Sans effet si la demande est déjà « élevée ».
// ----------------------------------------------------------------
async function upgradeUrgence(conversationId, cabinetId) {
  await supabaseAdmin.from('conversations').update({ urgence: 'elevee' }).eq('id', conversationId);
  const { data: rows } = await supabaseAdmin
    .from('demandes').select('id, urgence').eq('conversation_id', conversationId).limit(1);
  const d = rows && rows[0];
  if (!d || d.urgence === 'elevee') return;
  await supabaseAdmin.from('demandes').update({ urgence: 'elevee' }).eq('id', d.id);
  await notifyWebhook(cabinetId, 'urgence_relevee', { conversation_id: conversationId, urgence: 'elevee' });
}

// ----------------------------------------------------------------
// WEBHOOK D'AUTOMATISATION (Make, n8n, Zapier…)
// NOTIFY_* est le nom retenu ; N8N_* reste accepté pour rétrocompatibilité.
// Pour « nouvelle_demande », ce canal transmet le détail réel (motif, souhait), même en
// mode MINIMIZE_HEALTH_DATA=true : la minimisation réduit ce que NOUS stockons en base, pas
// ce que le cabinet reçoit pour agir (c'est le but du pass-through).
// → HTTPS obligatoire : une donnée de santé ne doit jamais transiter en clair.
// ----------------------------------------------------------------
async function notifyWebhook(cabinetId, event, payload) {
  const webhookUrl = process.env.NOTIFY_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.NOTIFY_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET;
  if (!webhookUrl) return;
  if (!/^https:\/\//i.test(webhookUrl)) {
    console.error('[rgpd] Webhook notif ignoré : NOTIFY_WEBHOOK_URL doit être en https (donnée de santé en jeu).');
    return;
  }
  const { data: cabinet } = await supabaseAdmin
    .from('cabinets')
    .select('nom, notif_email, notif_telephone')
    .eq('id', cabinetId)
    .single();
  // Awaited + borné : en serverless, un fetch non attendu peut être gelé (le cabinet ne
  // serait jamais notifié). AbortController pour ne pas bloquer au-delà de 8 s.
  const whController = new AbortController();
  const whTimeout = setTimeout(() => whController.abort(), 8000);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { 'X-Claire-Secret': webhookSecret } : {}),
      },
      body: JSON.stringify({ event, cabinet, ...payload }),
      signal: whController.signal,
    });
  } catch (e) {
    console.error('Webhook notif failed:', e);
  } finally {
    clearTimeout(whTimeout);
  }
}

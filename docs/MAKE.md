# Notifier le cabinet avec Make (recette pas à pas)

Quand Claire qualifie une nouvelle demande (ou reçoit un nouveau lead via le formulaire), elle envoie
un **webhook**. Ce guide branche ce webhook sur **Make** (ex-Integromat) pour prévenir le cabinet par
email — sans écrire une ligne de code.

> Rien à installer côté Claire : il suffit de renseigner deux variables d'environnement sur Vercel
> (`NOTIFY_WEBHOOK_URL` et `NOTIFY_WEBHOOK_SECRET`).

---

## 1. Créer le webhook dans Make

1. Sur [make.com](https://make.com) → **Create a new scenario**.
2. Ajoute un premier module : **Webhooks → Custom webhook**.
3. **Add** → donne-lui un nom (ex. `Claire — nouvelle demande`) → **Save**.
4. Make affiche une URL du type `https://hook.eu2.make.com/xxxxxxxxxxxx`. **Copie-la.**

## 2. Renseigner Claire (Vercel)

Dans Vercel → ton projet → **Settings → Environment Variables** :

| Variable | Valeur |
|----------|--------|
| `NOTIFY_WEBHOOK_URL` | l'URL copiée à l'étape 1 |
| `NOTIFY_WEBHOOK_SECRET` | une phrase secrète que tu inventes (ex. `claire-2026-Xk93...`) |

Puis **redeploy** pour que les variables soient prises en compte.

## 3. Laisser Make « apprendre » la structure des données

1. Dans Make, le module webhook affiche **« Determine data structure »** / *Re-determine*.
2. Déclenche un vrai envoi depuis Claire (teste la démo jusqu'à voir apparaître la carte
   « reçu par le cabinet », ou envoie le formulaire fondateurs de la page d'accueil).
3. Make capte le payload et mémorise les champs. ✅

## 4. Sécuriser : rejeter les appels non signés

Claire envoie le secret dans l'en-tête HTTP **`X-Claire-Secret`**. Pour n'accepter que les vrais appels :

1. Après le webhook, ajoute un module **Flow Control → Router** (ou un **Filter** sur le lien suivant).
2. Sur le filtre, condition :
   - **Champ** : `Headers → x-claire-secret` (Make met les en-têtes en minuscules)
   - **Opérateur** : `Equal to`
   - **Valeur** : ta valeur `NOTIFY_WEBHOOK_SECRET`
3. Tout ce qui ne correspond pas est ignoré → personne ne peut falsifier une notification.

## 5. Router selon le type d'événement

Le payload contient un champ **`event`** :

- `nouvelle_demande` → une demande patient qualifiée (depuis `/api/chat`)
- `nouveau_lead` → un cabinet intéressé (formulaire fondateurs, `/api/contact`)

Ajoute un **Router** avec un filtre par branche sur `event` pour traiter chaque cas différemment.

## 6. Envoyer l'email au cabinet

Sur la branche `nouvelle_demande`, ajoute **Gmail → Send an email** (ou *Email → Send*) :

- **To** : `{{cabinet.notif_email}}`
- **Subject** : `Nouvelle demande patient — urgence {{demande.urgence}}`
- **Content** (exemple) :
  ```
  Nouvelle demande reçue via Claire :

  Patient   : {{demande.patient_nom}}
  Téléphone : {{demande.patient_telephone}}
  Motif     : {{demande.motif}}
  Souhait   : {{demande.souhait}}
  Urgence   : {{demande.urgence}}
  ```

Sur la branche `nouveau_lead`, envoie-toi un email à toi (le mail du lead est dans `{{lead.email}}`).

> Astuce urgences : ajoute un filtre `demande.urgence = elevee` vers un module **WhatsApp / SMS**
> pour être alerté immédiatement sur les cas sérieux.

## 7. Activer

En bas à gauche du scénario Make, bascule **Scheduling** sur **ON**. C'est en place. 🎉

---

## Structure des payloads (référence)

**`event: "nouvelle_demande"`**
```json
{
  "event": "nouvelle_demande",
  "cabinet": { "nom": "...", "notif_email": "...", "notif_telephone": "..." },
  "demande": {
    "patient_nom": "...",
    "patient_telephone": "...",
    "motif": "...",
    "souhait": "...",
    "urgence": "normale | moderee | elevee"
  },
  "conversation_id": "uuid"
}
```

**`event: "nouveau_lead"`**
```json
{
  "event": "nouveau_lead",
  "lead": { "nom": "...", "cabinet": "...", "email": "...", "telephone": "...", "message": "..." }
}
```

En-tête envoyé avec chaque appel : `X-Claire-Secret: <NOTIFY_WEBHOOK_SECRET>`.

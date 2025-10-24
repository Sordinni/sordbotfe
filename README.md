# 📘 README – SordBOT Rouge  
**Bot privado de WhatsApp para figurinhas, downloads e muito mais**  
*Última atualização: 24/10/2025*

---

## 🧠 Índice
1. [O que é](#o-que-é)  
2. [Como usar – passo a passo](#como-usar--passo-a-passo)  
3. [Comandos de texto](#comandos-de-texto)  
4. [Gatilhos por mídia](#gatilhos-por-mídia)  
5. [Download de redes sociais](#download-de-redes-sociais)  
6. [Rate-limit & regras](#rate-limit--regras)  
7. [Grupos obrigatórios](#grupos-obrigatórios)  
8. [Dicas avançadas](#dicas-avançadas)  
9. [Erros comuns](#erros-comuns)  
10. [Roadmap / changelog](#roadmap--changelog)

---

## O que é
SordBOT Rouge é um número **privado** que transforma:
- fotos → figurinhas estáticas
- vídeos/GIFs → figurinhas animadas (≤ 10 s)
- links do Instagram, TikTok, Twitter, YouTube, Pinterest → mídia pronta para reenviar
- códigos do **emoji.gg** ou **stickers.gg** → figurinhas oficiais

Tudo **sem prefixo fixo** – basta enviar mídia ou link.

---

## Como usar – passo a passo

| Passo | O que fazer | O que acontece |
|-------|-------------|----------------|
| 1. **Entrar nos grupos obrigatórios** | Clique nos links da seção [Grupos obrigatórios](#grupos-obrigatórios) | Se sair, o bot **bloqueia** automaticamente |
| 2. **Salvar o número do bot** | `(número privado – só disponível nos grupos)` | Precisa estar nos contatos para figurinhas animadas funcionarem |
| 3. **Primeira interação** | Mande `ajuda` | Recebe o menu completo |
| 4. **Criar 1ª figurinha** | Envie **qualquer imagem** | Virará sticker instantaneamente |
| 5. **Criar sticker animado** | Envie **vídeo/GIF** ≤ 15 s | Bot converte para `.webp` animado |
| 6. **Personalizar metadados** | Digite:<br>`renomear "Meu Pack" "Meu Nome"` | Todos os seus stickers futuros terão esse pacote/autor |
| 7. **Alternar esticar imagem** | Digite `alternar` | Liga/desliga modo “stretch” (força quadrado 512×512) |
| 8. **Baixar rede social** | Cole **qualquer link** suportado | Mídia é baixada e reenviada automaticamente |

---

## Comandos de texto

| Comando | Alias aceitos | Descrição & exemplos |
|---------|---------------|----------------------|
| `ajuda` | `!ajuda`, `menu`, `!comandos`… | Lista tudo |
| `ping` | — | Testa latência e mostra uptime |
| `stats` | — | Suas estatísticas: total de stickers, primeiro uso |
| `limite` | `!limite` | Quantas figurinhas faltam no ciclo atual |
| `alternar` | — | Liga/desliga stretch mode |
| `renomear` | `r`, `ren` | `renomear "Pack" "Autor"` ou `renomear resetar` |
| `fig` | — | **Responda** uma mídia com `fig` para forçar sticker (útil quando o bot não reconhece) |

---

## Gatilhos por mídia

| Mídia recebida | Ação automática | Observações |
|----------------|-----------------|-------------|
| Imagem (jpg, png, webp) | → Sticker estático | Respeita config “stretch” |
| Vídeo (≤ 15 s) | → Sticker animado | Taxa de quadros ajustada para caber em 1 MB |
| GIF | → Sticker animado | Convertido para MP4 internamente |
| Documento de imagem | → Sticker estático | Mesmo fluxo da imagem |
| Sticker (reenviado) | → Renomeia se responder `renomear` | Mantém qualidade original |

---

## Download de redes sociais

**Basta enviar o link** – não precisa de comando.

| Plataforma | Formatos entregues | Observações |
|------------|--------------------|-------------|
| Instagram | Foto ou vídeo (alta) | Posts, Reels, Stories públicos |
| TikTok | Vídeo sem marca d’água + capa | Suporte a `vm.tiktok.com` |
| Twitter / X | Vídeo HD ou imagem | Threads pegam apenas 1ª mídia |
| YouTube | MP4 720p | Limitado a vídeos ≤ 5 min |
| Pinterest | Imagem ou vídeo | Suporte a pin.it |

Exemplos de mensagem:
```
https://www.instagram.com/reel/ABC123DEF/
```
```
https://vm.tiktok.com/ZMNxxxxx/
```

---

## Rate-limit & regras

| Item | Valor | O que acontece |
|------|-------|----------------|
| Limite por ciclo | **5 stickers** | Conta estáticos + animados |
| Cooldown | **6 minutos** | Após atingir 5, aguarde |
| Reset do ciclo | Automático | Assim que o cooldown termina |
| Bypass | **Não existe** | Administradores também respeitam |

---

## Grupos obrigatórios

| Grupo | Finalidade | Link |
|-------|------------|------|
| **Avisos Oficiais** | Regras, novidades, manutenção | [Entrar](https://chat.whatsapp.com/K1VVUPjqLZvKIW0GYFPZ8q) |
| **Administração** | Liberação de números bloqueados | (só admins) |

- **Sair de qualquer um = block automático**
- Para voltar, peça **desbloqueio** no grupo Administração respondendo a mensagem de aviso.

---

## Dicas avançadas

1. **Emoji.gg / Stickers.gg**
   - Envie só o código: `654321-nome-do-emoji`
   - Ou a URL inteira: `https://emoji.gg/sticker/654321-nome`
   - Bot tenta GIF primeiro; se falhar, PNG.

2. **Sticker perfeito 512×512**
   - Ative stretch: `alternar`
   - Envie imagem já quadrada → resultado sem bordas

3. **Renomear sticker antigo**
   - Responda o sticker com:<br>`renomear "Novo Pack" "Novo Autor"`
   - Bot reenvia o **mesmo sticker** com novos metadados

4. **Vídeo grande**
   - Corte antes de enviar (≤ 15 s)
   - Bot reduz FPS até caber em 1 MB; se falhar, avisa

5. **Bypass de mídia não reconhecida**
   - Responda com `fig` – força conversão

---

## Erros comuns

| Mensagem do bot | Causa | Solução |
|-----------------|-------|---------|
| “Limite atingido” | 5 stickers em 6 min | Aguarde ou use `limite` para verificar |
| “Não consegui baixar” | Link privado ou CDN bloqueado | Certifique-se que é público |
| “Vídeo muito grande” | > 1 MB após conversão | Reduza duração ou qualidade antes de enviar |
| “Número bloqueado” | Saiu do grupo Avisos | Re-entre e peça desbloqueio no grupo Admin |
| “Erro ao processar figurinha” | Memória ou codec incomum | Reenvie em formato diferente |

---

## Roadmap / changelog

- **d2410h1805** – Lançamento
  - stickers estáticos/animados
  - downloads Instagram, TikTok, Twitter, YouTube, Pinterest
  - rate-limit 5/6 min
  - grupos obrigatórios
  - renomear metadados
  - stretch mode

- **Breve**
  - comando `flood` para múltiplos stickers
  - extração de áudio de vídeo
  - stickers redondos (`--circle`)
  - whitelist de usuários VIP (sem rate-limit)

---

## 💬 Suporte

Dúvidas? **Mande `info`** no chat que o bot envia o contato do desenvolvedor.  
**Não chame no privado do número principal** – use o grupo Avisos.

> Divirta-se criando figurinhas!
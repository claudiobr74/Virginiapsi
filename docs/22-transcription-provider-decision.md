# Decisão de provider de transcrição — v1.6

Substitui o Deepgram como provider de transcrição do SerenaPsi. Decisão tomada em 20/08/2026, antes do início da Fase 6, a pedido do controlador do produto: o custo do Deepgram inviabilizava o app.

Esta decisão **supersede**, nos pontos abaixo, o item INT-005 de `docs/18-preimplementation-fixes-v1.3.md` e o item "Diarização Deepgram" de `docs/20-preimplementation-fixes-v1.4.md`. Aqueles documentos permanecem como registro histórico das auditorias e não devem ser reescritos.

## 1. Decisão

**Transcrição local-first no navegador, com fallback opcional no Groq.**

- **Padrão**: o áudio é transcrito no próprio dispositivo (Whisper/ONNX via WebGPU, com fallback WASM). O áudio nunca sai da máquina; nenhum suboperador recebe áudio de sessão.
- **Fallback opcional, por escolha explícita da organização**: quando o hardware não sustentar a transcrição local, a organização pode habilitar o Groq (Whisper large-v3-turbo). Nesse caso o Groq passa a ser suboperador e precisa constar do TCLE.
- **Sem fallback habilitado, a sessão continua normalmente sem transcrição.** Recusar/não ter transcrição nunca bloqueia o atendimento.

## 2. Custo — o que motivou a troca

Preços verificados em 20/08/2026, para 100 h de sessão/mês (~25 sessões semanais de 50 min).

| Opção | US$/h de áudio | US$/mês (100 h) | Diarização | Usa o áudio para treinar? |
|---|---:|---:|---|---|
| Deepgram Nova-3 streaming + diarização (preço de lista) | 0,58 | 58 | sim | não no preço de lista |
| Deepgram Nova-3 streaming + diarização (preço promocional) | 0,41 | 41 | sim | **sim** — a promoção pressupõe opt-in no Model Improvement Program |
| ElevenLabs Scribe v2 (batch) | 0,22 | 22 | inclusa | não |
| Groq Whisper large-v3-turbo (batch) | 0,04 | 4 | não | não |
| **Local no navegador** | **0** | **0** | não | o áudio não sai do dispositivo |

Dois achados decidiram a questão:

1. **O caro é o streaming, não a transcrição.** Deepgram streaming custa ~11× o Groq batch pelo mesmo trabalho. A latência ao vivo é que se paga.
2. **A tarifa promocional do Deepgram tem preço em dado.** Ela pressupõe adesão ao programa que compartilha o áudio para treinar modelos — incompatível com áudio de sessão clínica sob `docs/19-lgpd-privacy.md`. O preço aplicável ao SerenaPsi era, portanto, o de lista.

O Groq tem ainda tier gratuito de 28.800 segundos de áudio/dia (8 h/dia), suficiente para a agenda de um consultório solo, e política de não-treinamento válida igualmente para free e pago, com Zero Data Retention self-serve.

## 3. Por que local-first e não apenas "o mais barato"

O ganho principal não é o custo, é a postura de privacidade:

- o áudio de sessão — o dado mais sensível do produto — deixa de sair do dispositivo;
- o inventário de suboperadores de `docs/19-lgpd-privacy.md` §2 perde a linha de maior risco ("dado de saúde, exige atenção redobrada");
- some a transferência internacional de áudio bruto no caminho padrão;
- o TCLE fica menor e mais sustentável;
- é privacidade **por arquitetura, verificável no painel de rede do navegador**, não por política contratual.

Efeito colateral relevante: a Fase 6 encolhe. Sem provider externo no caminho padrão não há token temporário, TTL de 30s, fresh-token-on-reconnect nem `session-audio-fallback` obrigatório. Menos código e menos superfície de risco.

## 4. Trade-offs aceitos

- **Qualidade**: WER de ~10% com `whisper-small` afinado para português, contra ~6% do melhor provider gerenciado. Aceito porque a transcrição já é tratada como provisória e falível em todo o produto.
- **Diarização deixa de ser obrigatória.** Nenhuma opção viável entrega diarização boa de graça. Como a spec já trata rótulo de falante como provisório e proíbe que vire fato clínico sem confirmação, **degradar para "sem rótulo" é mais honesto que exibir rótulo ruim**. Diarização passa a ser capacidade opcional do provider: quando ausente, a UI não inventa falante.
- **Dependência do hardware da profissional**: exige WebGPU (com queda para WASM) e baixa 120–590 MB de pesos na primeira sessão, cacheados depois. O produto precisa detectar capacidade e oferecer o fallback quando não houver.
- **Latência**: transcrição local em janelas, não streaming palavra a palavra. O texto continua incremental, com trecho em processamento marcado como provisório.

## 5. Consequências arquiteturais

1. **Port de transcrição.** `TranscriptionProvider` é uma porta com adapters (`local-webgpu`, `groq-batch`). Provider é configuração, não arquitetura: trocar de provider deve custar um adapter, nunca um refactor.
2. **O consent gate permanece igual e ganha importância.** Ele deixa de guardar apenas a emissão de credencial e passa a autorizar **o ato de capturar**: ativar microfone, persistir segmentos de transcrição e emitir grant de upload do fallback. As capabilities passam a ser `session_capture_grant` e `audio_fallback_upload_grant` — nomes neutros de provider.
3. **Enforcement server-side no caminho local.** Como o servidor não intermedia o áudio local, o ponto de enforcement é a **persistência**: o servidor recusa gravar segmento de transcrição sem grant de captura válido. Sem isso, "gate local" seria enforcement de fachada.
4. **`GROQ_API_KEY` é server-only e opcional.** Sem ela, o fallback simplesmente não é oferecido; o app funciona inteiro. Nenhuma chave de transcrição vai para o browser em nenhum cenário.
5. **`session-audio-fallback` continua existindo, mas só é usado no caminho de fallback**, com as mesmas regras: nada de upload autorizado apenas por membership, sempre por grant emitido após o consent gate.

## 6. O que muda no kit

`MASTER_PROMPT.md`, `AGENTS.md`, `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md`, `docs/03`, `docs/05`, `docs/06` §3, `docs/07`, `docs/08`, `docs/09`, `docs/10`, `docs/11`, `docs/13`, `docs/14`, `docs/16`, `docs/19` §2, `prompts/06`, `prompts/12`, `.cursor/rules/08-transcription.mdc`, `.cursor/rules/12-testing.mdc`, `.cursor/agents/transcription.md`, `.cursor/skills/local-transcription/SKILL.md` e `PROJECT_MANIFEST.json`.

## 7. Validação

- ✅ **Spike de qualidade em pt-BR — executado em 20/08/2026, decisão confirmada.** Resultados em `docs/23-transcription-spike-results.md`: `whisper-large-v3-turbo` atinge 5,9% de WER local, melhor que o melhor provider pago comparado aqui; mesmo o pior caso medido (WASM sem GPU, modelo `small`) acompanha a sessão ao vivo com 15,1% de WER. O spike também desqualificou a quantização q8, que produz alucinação em loop — a Fase 6 deve usar quantização híbrida.
- ⚠ **Continua pendente**: o corpus do spike é fala lida e limpa, então o WER real de consultório será pior; e WebGPU não pôde ser medido no ambiente de CI. Validar com áudio representativo no hardware da profissional antes de fixar o `turbo` como padrão.
- ⚠ **VALIDAÇÃO JURÍDICA HUMANA**: o TCLE deve descrever corretamente qual caminho a organização usa. Habilitar o fallback Groq muda o inventário de suboperadores e exige nova versão de consentimento (`consents.version`).

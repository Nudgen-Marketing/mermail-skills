# 🛡️ Mermail Protocol: Guía Maestra de Seguridad, Criptografía y Zero-Trust

---

## 1. Criptografía y Encriptación a Prueba de Fallos

### 1.1 Implementación Estricta de AES-256-GCM
* **Regla Crítica de Nonce Único:** Jamás reutilizar un vector de inicialización (nonce) con la misma clave simétrica.
* **Parámetros Estrictos:** 
  - Nonce de 96 bits (12 bytes) generado criptográficamente (`crypto.randomBytes(12)`).
  - Etiqueta de autenticación (Tag) de 128 bits (16 bytes).
  - Verificación en tiempo constante antes de retornar cualquier fragmento de texto plano.
* **Resistencia a Mal Uso (Misuse-Resistance):** En topologías distribuidas sin sincronización de estado, contemplar AES-GCM-SIV o XChaCha20-Poly1305 (nonce de 192 bits).
* **Almacenamiento Híbrido (HyARC):** Encapsulamiento de secretos maestros con cSHAKE256 y KDF en memoria con Argon2id.
* **Transición Post-Cuántica:** Integración de esquemas híbridos X25519/Ed25519 + ML-KEM-768 y ML-DSA-65.

---

## 2. Arquitectura de Confianza Cero (Zero Trust) y Control de Acceso

* **Validación Continua:** No asumir confianza perimetral; reevaluar firmas y autorizaciones en cada llamada.
* **Menor Privilegio (Least Privilege) & JIT:** Permisos acotados por tarea con TTLs cortos de ejecución.
* **Defensa contra "Token Passthrough" (Confused Deputy):** Validación estricta de audiencia (`aud`) y destinatario (`to`) en los sobres cifrados antes del procesamiento.
* **Autenticación Fuerte de Clientes (SCA / MFA):** Requerimiento de firma Ed25519 explícita por cada instrucción financiera.

---

## 3. Integridad de Mensajes y Protección de Red

* **Cifrado en Tránsito y mTLS:** Exigencia de TLS 1.3 / mTLS en comunicaciones inter-servicio.
* **Firmas por Mensaje:** Cada sobre Mermail incorpora una firma desacoplada Ed25519 sobre el JSON canonicalizado (RFC 8785).
* **Defensa Integral Anti-SSRF:** Bloqueo explícito de:
  - Metadatos de proveedores Cloud (`169.254.169.254`, `metadata.google.internal`).
  - Rangos privados RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - Loopback (`127.0.0.1`, `localhost`, `::1`) en modo público.

---

## 4. Modelado de Amenazas STRIDE & Seguridad en Aplicaciones

| Amenaza (STRIDE) | Vector Potencial | Mitigación Implementada |
| :--- | :--- | :--- |
| **Spoofing** | Suplantación de identidad de agente | Firma Ed25519 y verificación criptográfica estricta. |
| **Tampering** | Modificación de payloads en tránsito | Auth Tag AES-256-GCM de 128 bits y JSON canonicalizado. |
| **Repudiation** | Negación de emisión de transacciones | Registro de hash inmutable en Cryptographic Ledger. |
| **Information Disclosure** | Fuga de secretos o datos de tareas | Encriptación de extremo a extremo (E2EE) X25519/AES-GCM. |
| **Denial of Service** | Ataques de recombinación / Memory Exhaustion | Límites de recursión (profundidad $\le 32$), control de tamaño de payload y poda LRU. |
| **Elevation of Privilege** | Explotación de llamadas MCP | Sandboxing de ejecución y compuertas Human-in-the-Loop. |

* **Inmunidad DOM-XSS:** Uso exclusivo de enlaces seguros de texto (`textContent`) y sanitización de entidades HTML (`escapeHtml`).

---

## 5. Seguridad Específica para Agentes IA & Servidores MCP

* **Human-in-the-Loop:** Operaciones financieras que superen los umbrales de seguridad (ej. $> 100\text{ USDC}$) exigen confirmación explícita o quedan restringidas a modo simulación (`simulate_only: true`).
* **Sandboxing de Herramientas:** Aislamiento de procesos con límites de llamadas al sistema (seccomp / AppArmor / TEEs).
* **Detección de Anomalías (UEBA):** Cuarentena inmediata ante discrepancias en patrones de ejecución o inyecciones indirectas de prompts.

---

## 6. Mega-Prompt para Auditoría Integral (NotebookLM / LLMs)

```text
Actúa como un Principal Security Architect y Lead Cryptographer especializado en Interoperabilidad de Agentes de IA, Criptografía Avanzada, Arquitecturas Zero Trust y protocolos MCP.

Basándote de manera exhaustiva y estricta en las especificaciones provistas en esta libreta, realiza una auditoría integral y genera un informe técnico accionable estructurado en 5 ejes:

1. CRIPTOGRAFÍA & BLINDAJE CONTRA REUSO DE NONCE:
   - Evalúa la implementación de AES-256-GCM (nonce de 96 bits, tag de 128 bits en tiempo constante).
   - Analiza la viabilidad de migrar a algoritmos misuse-resistant (AES-GCM-SIV, XChaCha20-Poly1305), almacenamiento híbrido HyARC (cSHAKE256 + Argon2id) y esquemas post-cuánticos híbridos (ML-KEM-768, ML-DSA-65 con X25519/Ed25519).

2. ZERO TRUST, AUDIENCE VALIDATION & mTLS:
   - Audita el flujo de autenticación y previene el "Token Passthrough" (ataques Confused Deputy) mediante validación estricta de audiencia.
   - Especifica la política de permisos Just-in-Time (JIT) y la capa de red con mTLS y filtrado anti-SSRF (bloqueo de metadatos de nube e IPs privadas).

3. FIRMA POR MENSAJE Y MODELADO STRIDE:
   - Modela las amenazas STRIDE para la comunicación entre agentes autónomos.
   - Detalla la verificación de firmas desacopladas (Ed25519 / JWS) y la mitigación de inyecciones DOM-XSS con CSP.

4. SEGURIDAD ESPECÍFICA MCP & AGENTES IA:
   - Define las compuertas Human-in-the-Loop para operaciones financieras y destructivas.
   - Establece la configuración técnica de sandboxing (AppArmor/seccomp/SELinux/TEEs) y el motor de cuarentena heurística UEBA contra Prompt Injection y envenenamiento de contexto.

5. MATRIZ DE 10 CASOS DE PRUEBA EXTREMOS (ADVERSARIAL SUITE):
   - Proporciona 10 escenarios de prueba adversaria (nonce collisions, prompt injection indirecto, escape de sandbox, token replay, alteración de payloads firmados y llamadas SSRF) para automatizar en el pipeline CI/CD con SAST/SCA.
```

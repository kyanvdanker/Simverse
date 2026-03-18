# How to add Share + Load into index.html
# ══════════════════════════════════════════════════════════════════════════════
# Two changes needed. Both are plain copy-paste — no build step required.
# ══════════════════════════════════════════════════════════════════════════════


══════════════════════════════════════════════════════════════════════════════
 CHANGE 1 — Add the Share button to the topbar
══════════════════════════════════════════════════════════════════════════════

Find this line in the topbar HTML (around line 170 in your index.html):

    <button class="btn" id="angb" onclick="toggleAngle()">📐 Angle</button>
    <div class="vs"></div>

Replace it with:

    <button class="btn" id="angb" onclick="toggleAngle()">📐 Angle</button>
    <div class="vs"></div>
    <button class="btn" style="border-color:#22d3ee33;color:#22d3ee" onclick="openShareModal()">⬆ Share</button>
    <a href="simulations.html" class="btn" style="color:#f59e0b;border-color:#f59e0b33">🌐 Community</a>
    <div class="vs"></div>


══════════════════════════════════════════════════════════════════════════════
 CHANGE 2 — Add the Share modal + JS at the bottom of index.html
══════════════════════════════════════════════════════════════════════════════

Find this line near the very bottom of index.html (just before </body>):

    lp('solarsystem');
    </script>
    </body>
    </html>

Replace it with the following (keep lp('solarsystem') — just add everything after it):

    lp('solarsystem');

    // ════════════════════════════════════════════════════════
    //  SIMULATION SHARING
    // ════════════════════════════════════════════════════════

    // ── Serialize current state ───────────────────────────────
    function serializeState() {
      return {
        bodies: BDS.map(b => ({
          type:        b.type,
          name:        b.name,
          x:           b.x,        y:    b.y,
          vx:          b.vx,       vy:   b.vy,
          mass:        b.mass,
          radius:      b.radius,
          color:       b.color,
          charge:      b.charge       ?? 0,
          restitution: b.restitution  ?? 0.8,
          material:    b.material     || 'default',
          pinned:      b.pinned       || false,
          fuel:        b.fuel         ?? null,
          forces: (b.forces || []).map(f => ({
            type:   f.type,
            params: { ...f.params },
          })),
        })),
        surfs: SURFS.map(s => ({
          type:     s.type,
          y:        s.y     ?? null,
          x:        s.x     ?? null,
          angle:    s.angle ?? null,
          material: s.material || 'concrete',
        })),
        view: { scale: view.scale, camX: view.camX, camY: view.camY },
        spd:  +(document.getElementById('ssr')?.value ?? 0),
        mode: document.getElementById('mbadge')?.textContent?.toLowerCase()?.includes('space') ? 'space' : 'surface',
      };
    }

    // ── Deserialize and load a shared state ───────────────────
    function loadSharedState(state) {
      clearAll();

      // Restore view
      if (state.view) {
        view.scale = state.view.scale ?? 50;
        view.camX  = state.view.camX  ?? 0;
        view.camY  = state.view.camY  ?? 0;
      }
      if (state.spd !== undefined) setSpd(state.spd);

      // Restore surfaces
      (state.surfs || []).forEach(sd => {
        try {
          const surf = new Surface({ type: sd.type, y: sd.y, x: sd.x, angle: sd.angle, material: sd.material });
          SURFS.push(surf);
        } catch(e) { console.warn('[load] Surface error:', e); }
      });

      // Restore bodies
      // We need to do two passes: first create all bodies (so force targets resolve),
      // then wire up forces that reference other bodies by id.
      const idMap = {};  // old serialised index → new Body object
      (state.bodies || []).forEach((bd, i) => {
        try {
          const b = new Body({
            type:        bd.type        || 'sphere',
            name:        bd.name        || ('Body ' + (i+1)),
            x:           bd.x           ?? 0,
            y:           bd.y           ?? 0,
            vx:          bd.vx          ?? 0,
            vy:          bd.vy          ?? 0,
            mass:        bd.mass        ?? 1,
            radius:      bd.radius      ?? 0.2,
            color:       bd.color       || pickColor(),
            charge:      bd.charge      ?? 0,
            restitution: bd.restitution ?? 0.8,
            material:    bd.material    || 'default',
            pinned:      bd.pinned      || false,
            fuel:        bd.fuel        ?? undefined,
          });
          BDS.push(b);
          idMap[i] = b;
        } catch(e) { console.warn('[load] Body error:', e); }
      });

      // Second pass: add forces (resolve tgtId / srcId by position in original array)
      (state.bodies || []).forEach((bd, i) => {
        const b = idMap[i];
        if (!b) return;
        (bd.forces || []).forEach(f => {
          try {
            const p = { ...f.params };
            // Remap body-reference params to new IDs
            ['tgtId','srcId','gndId'].forEach(key => {
              if (p[key] != null) {
                // Find original index by matching stored id value against old body ids
                const origIdx = (state.bodies || []).findIndex((ob, oi) => {
                  // If we stored the actual old UUID, match by index position heuristic
                  return oi === p[key] || (idMap[oi] && idMap[oi].id === p[key]);
                });
                p[key] = origIdx >= 0 && idMap[origIdx] ? idMap[origIdx].id : null;
              }
            });
            b.addForce(f.type, p);
          } catch(e) { console.warn('[load] Force error:', f.type, e); }
        });
      });

      calcAccels();
      snap();
      notify('✅ Shared simulation loaded!');
    }

    // ── Auto-load from URL param ──────────────────────────────
    // If the page is opened with ?sim=<id>, fetch and load that simulation.
    (async () => {
      const simId = new URLSearchParams(location.search).get('sim');
      if (!simId) return;
      try {
        const r = await fetch(`/api/simulations/${simId}`);
        if (!r.ok) { notify('⚠ Simulation not found'); return; }
        const sim = await r.json();
        loadSharedState(sim.state);
        notify(`📂 Loaded: "${sim.title}" by ${sim.author}`);
      } catch(e) {
        notify('⚠ Failed to load simulation');
        console.error('[share] Load error:', e);
      }
    })();

    // ── Share modal HTML (injected once) ─────────────────────
    (function injectShareModal() {
      const html = `
    <div id="share-overlay" style="
      display:none;position:fixed;inset:0;z-index:950;
      background:rgba(0,0,0,.85);align-items:center;justify-content:center;padding:1rem">
      <div style="
        background:#0b0d18;border:1px solid #243060;border-radius:8px;
        width:100%;max-width:420px;box-shadow:0 24px 80px rgba(0,0,0,.8);overflow:hidden">

        <!-- Header -->
        <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid #1a2138">
          <div style="width:8px;height:8px;border-radius:50%;background:#22d3ee"></div>
          <span style="font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:2px;color:#e2e8f0;flex:1">Share Simulation</span>
          <button onclick="closeShareModal()" style="
            width:22px;height:22px;border-radius:2px;border:1px solid #1a2138;
            background:none;color:#64748b;font-size:12px;cursor:pointer;
            display:flex;align-items:center;justify-content:center">✕</button>
        </div>

        <!-- Body -->
        <div style="padding:16px">
          <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:#64748b;margin-bottom:3px;letter-spacing:1.5px;text-transform:uppercase">Simulation title *</div>
          <input id="sh-title" type="text" maxlength="80" placeholder="e.g. Double Pendulum with Drag" style="
            width:100%;padding:7px 10px;background:#06080e;border:1px solid #243060;
            border-radius:3px;color:#e2e8f0;font-family:'JetBrains Mono',monospace;font-size:11px;
            outline:none;margin-bottom:10px" onfocus="this.style.borderColor='#22d3ee'" onblur="this.style.borderColor='#243060'">

          <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:#64748b;margin-bottom:3px;letter-spacing:1.5px;text-transform:uppercase">Description</div>
          <textarea id="sh-desc" maxlength="500" placeholder="What does this simulation demonstrate? What's interesting about it?" style="
            width:100%;padding:7px 10px;background:#06080e;border:1px solid #243060;
            border-radius:3px;color:#e2e8f0;font-family:'JetBrains Mono',monospace;font-size:11px;
            outline:none;height:80px;resize:vertical;margin-bottom:10px;line-height:1.5" onfocus="this.style.borderColor='#22d3ee'" onblur="this.style.borderColor='#243060'"></textarea>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <div>
              <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:#64748b;margin-bottom:3px;letter-spacing:1.5px;text-transform:uppercase">Your name</div>
              <input id="sh-author" type="text" maxlength="60" placeholder="Leave blank for Anonymous" style="
                width:100%;padding:7px 10px;background:#06080e;border:1px solid #243060;
                border-radius:3px;color:#e2e8f0;font-family:'JetBrains Mono',monospace;font-size:11px;
                outline:none" onfocus="this.style.borderColor='#22d3ee'" onblur="this.style.borderColor='#243060'">
            </div>
            <div>
              <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:#64748b;margin-bottom:3px;letter-spacing:1.5px;text-transform:uppercase">Tags (comma-separated)</div>
              <input id="sh-tags" type="text" maxlength="100" placeholder="gravity, solar, chaos…" style="
                width:100%;padding:7px 10px;background:#06080e;border:1px solid #243060;
                border-radius:3px;color:#e2e8f0;font-family:'JetBrains Mono',monospace;font-size:11px;
                outline:none" onfocus="this.style.borderColor='#22d3ee'" onblur="this.style.borderColor='#243060'">
            </div>
          </div>

          <!-- Status message -->
          <div id="sh-status" style="
            display:none;padding:7px 10px;border-radius:3px;border:1px solid;
            font-size:10px;font-family:'JetBrains Mono',monospace;margin-bottom:10px;line-height:1.5"></div>

          <!-- Submit -->
          <button id="sh-submit" onclick="submitShare()" style="
            width:100%;padding:9px;border-radius:3px;background:#06b6d4;color:#000;
            font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;
            letter-spacing:1px;text-transform:uppercase;border:none;cursor:pointer;transition:all .12s"
            onmouseover="this.style.background='#22d3ee'" onmouseout="this.style.background='#06b6d4'">
            ⬆ SHARE WITH COMMUNITY
          </button>
          <div style="text-align:center;margin-top:8px;font-size:9px;font-family:'JetBrains Mono',monospace;color:#334155">
            Shared simulations are public · max 5 per minute
          </div>
        </div>
      </div>
    </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
    })();

    function openShareModal() {
      // Show body count preview
      const bodies = BDS.length;
      if (bodies === 0) { notify('Add at least one object before sharing.'); return; }
      document.getElementById('sh-status').style.display = 'none';
      document.getElementById('sh-submit').disabled = false;
      document.getElementById('sh-submit').textContent = '⬆ SHARE WITH COMMUNITY';
      const overlay = document.getElementById('share-overlay');
      overlay.style.display = 'flex';
    }

    function closeShareModal() {
      document.getElementById('share-overlay').style.display = 'none';
    }

    // Close on overlay click
    document.addEventListener('click', e => {
      const overlay = document.getElementById('share-overlay');
      if (e.target === overlay) closeShareModal();
    });

    async function submitShare() {
      const title  = document.getElementById('sh-title').value.trim();
      const desc   = document.getElementById('sh-desc').value.trim();
      const author = document.getElementById('sh-author').value.trim();
      const tagsRaw = document.getElementById('sh-tags').value;
      const tags   = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const status = document.getElementById('sh-status');
      const btn    = document.getElementById('sh-submit');

      if (!title) {
        showShareStatus('error', 'Please enter a title for your simulation.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Uploading…';

      const simState = serializeState();

      try {
        const r = await fetch('/api/simulations', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title, description: desc, author, tags, state: simState }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Upload failed');

        const shareUrl = `${location.origin}${location.pathname}?sim=${data.id}`;
        showShareStatus('success',
          `✅ Shared! <a href="simulations.html" style="color:#22d3ee">View in Community Gallery</a><br>` +
          `<span style="color:#64748b">Direct link: </span>` +
          `<span style="color:#22d3ee;cursor:pointer" onclick="navigator.clipboard.writeText('${shareUrl}');this.textContent='Copied!'">${shareUrl}</span>`
        );
        btn.textContent = '✓ SHARED';
      } catch(e) {
        showShareStatus('error', '⚠ ' + e.message);
        btn.disabled = false;
        btn.textContent = '⬆ SHARE WITH COMMUNITY';
      }
    }

    function showShareStatus(type, html) {
      const el = document.getElementById('sh-status');
      el.style.display = 'block';
      if (type === 'success') {
        el.style.borderColor = '#22c55e44';
        el.style.background  = '#22c55e11';
        el.style.color       = '#94a3b8';
      } else {
        el.style.borderColor = '#ef444444';
        el.style.background  = '#ef444411';
        el.style.color       = '#ef4444';
      }
      el.innerHTML = html;
    }

    </script>
    </body>
    </html>


══════════════════════════════════════════════════════════════════════════════
 THAT'S IT.
══════════════════════════════════════════════════════════════════════════════

Summary of what you added:
  • ⬆ Share button in the topbar
  • 🌐 Community button linking to simulations.html
  • Share modal (title, description, author/anonymous, tags)
  • serializeState() — captures all bodies, forces, surfaces, view, speed
  • loadSharedState() — restores a serialized state into the live simulator
  • Auto-load on ?sim=<id> — visiting index.html?sim=abc123 loads that simulation

No npm packages needed. No build step.
Just restart your node server.js after updating server.js.

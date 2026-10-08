// A quiet custom cursor: an ivory point that becomes a ring over a work, a
// grab mark over something that can be held, a thin line over the timeline.
// A tiny label can trail it for a moment ("TAKE HOLD", "LET GO").
export class Cursor {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'cursor';
    this.el.innerHTML = '<i></i><span></span>';
    document.body.appendChild(this.el);
    this.label = this.el.querySelector('span');
    this.state = 'default';
    this.x = innerWidth / 2; this.y = innerHeight / 2;
    this.tx = this.x; this.ty = this.y;
    this.fine = matchMedia('(pointer: fine)').matches;
    if (!this.fine) { this.el.style.display = 'none'; return; }
    document.documentElement.classList.add('custom-cursor');
    window.addEventListener('pointermove', (e) => {
      this.tx = e.clientX; this.ty = e.clientY;
      const t = e.target;
      // UI elements own their own states
      if (t.closest?.('#track, #find-track')) this.ui = 'line';
      else if (t.closest?.('button, a, input, textarea, .hotspot, [data-cursor="ring"]')) this.ui = 'ring';
      else this.ui = null;
      this.render();
    });
    document.addEventListener('pointerleave', () => this.el.classList.add('gone'));
    document.addEventListener('pointerenter', () => this.el.classList.remove('gone'));
    const loop = () => {
      this.x += (this.tx - this.x) * 0.35;
      this.y += (this.ty - this.y) * 0.35;
      this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
      requestAnimationFrame(loop);
    };
    loop();
  }

  /** default | ring | grab | grabbing | line | hidden — set by the scene. */
  set(state) {
    if (state === this.state) return;
    this.state = state;
    this.render();
  }

  render() {
    const s = this.ui || this.state;
    this.el.dataset.state = s;
  }

  say(text, ms = 1400) {
    clearTimeout(this._t);
    this.label.textContent = text || '';
    this.el.classList.toggle('talking', !!text);
    if (text && ms) this._t = setTimeout(() => this.el.classList.remove('talking'), ms);
  }
}

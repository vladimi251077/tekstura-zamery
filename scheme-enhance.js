(() => {
  const ROOT_ID = 'scheme-enhance-root';
  const STYLE_ID = 'scheme-enhance-style';

  const VARIANT_OPTIONS = [
    { key: 'straight', label: 'Прямая', shape: 'straight', side: 'left', variant: 'landing' },
    { key: 'l_left_landing', label: 'Г-образная левая, площадка', shape: 'l', side: 'left', variant: 'landing' },
    { key: 'l_right_landing', label: 'Г-образная правая, площадка', shape: 'l', side: 'right', variant: 'landing' },
    { key: 'l_left_winder', label: 'Г-образная левая, забежные', shape: 'l', side: 'left', variant: 'winder' },
    { key: 'l_right_winder', label: 'Г-образная правая, забежные', shape: 'l', side: 'right', variant: 'winder' },
    { key: 'u_landing', label: 'П-образная с площадкой', shape: 'u', side: 'left', variant: 'landing' },
    { key: 'empty_opening', label: 'Только пустой проём', shape: 'l', side: 'left', variant: 'empty' }
  ];

  const EMPTY_FIELDS = [
    { code: 'H', name: 'height_clean_to_clean_mm', label: 'Высота', unit: 'мм', fallback: '3267' },
    { code: 'L', name: 'opening_length_mm', label: 'Длина проёма', unit: 'мм', fallback: '2223' },
    { code: 'W', name: 'opening_width_mm', label: 'Ширина проёма', unit: 'мм', fallback: '2223' },
    { code: 'T', name: 'slab_thickness_mm', label: 'Толщина проёма', unit: 'мм', fallback: '120' },
    { code: 'B', name: 'desired_flight_width_mm', label: 'Ширина марша', unit: 'мм', fallback: '900' }
  ];

  const READY_BASE_FIELDS = [
    { code: 'H', name: 'height_clean_to_clean_mm', label: 'Высота', unit: 'мм', fallback: '3267' },
    { code: 'L', name: 'opening_length_mm', label: 'Длина проёма', unit: 'мм', fallback: '2223' },
    { code: 'W', name: 'opening_width_mm', label: 'Ширина проёма', unit: 'мм', fallback: '2223' },
    { code: 'T', name: 'slab_thickness_mm', label: 'Толщина проёма', unit: 'мм', fallback: '120' },
    { code: 'B1', name: 'flight1_width_mm', label: 'Ширина марша 1', unit: 'мм', fallback: '826' },
    { code: 'N1', name: 'visual_steps_1', label: 'Ступени марш 1', unit: 'шт', fallback: '8' },
    { code: 'h', name: 'visual_riser_mm', label: 'Подступёнок', unit: 'мм', fallback: '204' },
    { code: 'b', name: 'visual_tread_mm', label: 'Проступь', unit: 'мм', fallback: '275' },
    { code: 'R', name: 'visual_balustrade', label: 'Балюстрада', unit: '', fallback: 'Да' }
  ];

  const READY_EXTRA_FIELDS = [
    { code: 'B2', name: 'flight2_width_mm', label: 'Ширина марша 2', unit: 'мм', fallback: '941' },
    { code: 'N2', name: 'visual_steps_2', label: 'Ступени марш 2', unit: 'шт', fallback: '4' },
    { code: 'Z', name: 'visual_winder_steps', label: 'Забежные / площадка', unit: 'шт', fallback: '5' }
  ];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{width:100%;max-width:100%;display:block;margin:0 0 18px;color:#08142f}
      #${ROOT_ID} *{box-sizing:border-box}
      .se-hidden-legacy{display:none!important}
      .tzm-board{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;align-items:start}
      .tzm-work-card,.tzm-side{background:#fff;border:1px solid #dbe5f1;border-radius:18px;box-shadow:0 12px 32px rgba(15,23,42,.055)}
      .tzm-work-card{padding:14px;min-width:0}.tzm-side{padding:14px;position:sticky;top:74px}
      .tzm-top{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;margin-bottom:12px}
      .tzm-mode{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cfd9e8;border-radius:14px;overflow:hidden;background:#fff}
      .tzm-mode button{height:44px;border:0;background:#fff;color:#08142f;font-size:14px;font-weight:950;cursor:pointer}
      .tzm-mode button[aria-pressed="true"]{background:#061844;color:#fff}
      .tzm-variant{display:grid;gap:4px}.tzm-variant span{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-weight:950}
      .tzm-variant select{height:44px;width:100%;border:1px solid #cfd9e8;border-radius:14px;background:#fff;color:#08142f;font-size:14px;font-weight:850;padding:0 12px;outline:none}
      .tzm-drawing{height:640px;min-height:640px;border:1px solid #d4deeb;border-radius:16px;background:#fff;overflow:hidden}.tzm-drawing svg{width:100%;height:100%;display:block;background:#fff}
      .tzm-comment{display:grid;grid-template-columns:170px 1fr;gap:10px;align-items:start;margin-top:12px}.tzm-comment label{font-size:13px;font-weight:950;color:#334155;padding-top:9px}
      .tzm-comment textarea{width:100%;min-height:46px;border:1px solid #cbd5e1;border-radius:12px;padding:11px 12px;font-size:14px;line-height:1.35;resize:vertical;outline:none;color:#0f172a;background:#fff}
      .tzm-side h3{margin:0 0 12px;font-size:17px;line-height:1.15;color:#071432;font-weight:950}.tzm-fields{display:grid;gap:7px}
      .tzm-field{display:grid;grid-template-columns:46px minmax(0,1fr) 86px 28px;gap:7px;align-items:center;min-height:48px;padding:6px;border-bottom:1px solid #e5edf7}.tzm-field:last-child{border-bottom:0}
      .tzm-code{height:32px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:#061844;color:#fff;font-size:14px;font-weight:950}.tzm-label{font-size:12px;font-weight:800;color:#475569;line-height:1.15;min-width:0}
      .tzm-field input{height:34px;width:100%;border:1px solid #cbd5e1;border-radius:10px;text-align:center;color:#08142f;background:#fff;font-size:15px;font-weight:950;padding:5px 6px;outline:none}.tzm-unit{font-size:11px;color:#64748b;font-weight:900;font-style:normal}
      .tzm-info{margin-top:12px;border-radius:14px;background:#f1f6ff;border:1px solid #d9e8ff;color:#12346a;padding:12px;font-size:13px;font-weight:800;line-height:1.4}.tzm-actions{display:grid;gap:9px;margin-top:12px}.tzm-actions button{height:44px;border-radius:12px;border:1px solid #d4deeb;background:#fff;color:#08142f;font-size:14px;font-weight:950;cursor:pointer}.tzm-actions button.primary{background:#061844;color:#fff;border-color:#061844}
      @media (max-width:1320px){.tzm-board{grid-template-columns:1fr}.tzm-side{position:static}.tzm-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.tzm-drawing{height:560px;min-height:560px}.tzm-comment{grid-template-columns:1fr}}
      @media (max-width:760px){.tzm-work-card,.tzm-side{border-radius:14px;padding:10px}.tzm-top{grid-template-columns:1fr}.tzm-drawing{height:420px;min-height:420px}.tzm-fields{grid-template-columns:1fr}.tzm-field{grid-template-columns:46px minmax(0,1fr) 96px 28px;min-height:54px}.tzm-field input{height:40px;font-size:17px}.tzm-mode button,.tzm-variant select{height:46px;font-size:15px}}
      @media (max-width:430px){.tzm-drawing{height:360px;min-height:360px}.tzm-field{grid-template-columns:44px minmax(0,1fr)}.tzm-field input{grid-column:1/3}.tzm-unit{display:none}}
    `;
    document.head.appendChild(style);
  }

  const form = () => document.querySelector('#measurement-form');
  const panel = () => document.querySelector('[data-panel="sizes"]');
  function field(name){ const f=form(); let el=f?.querySelector(`[name="${name}"]`); if(!el&&f){el=document.createElement('input'); el.type='hidden'; el.name=name; f.appendChild(el);} return el; }
  function read(name,fallback=''){ const value=field(name)?.value; return value || fallback; }
  function write(name,value){ const el=field(name); if(!el)return; el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }

  function stateFromForm(){
    const site=read('site_situation','Пустой проём'); const opening=read('opening_type','Г-образный левый'); const turn=read('turn_type','Площадка');
    const mode=site.includes('Готов')?'ready':'empty'; const shape=opening.includes('П-')?'u':opening.includes('Прям')?'straight':'l'; const side=opening.toLowerCase().includes('прав')?'right':'left'; const variant=turn.toLowerCase().includes('заб')?'winder':'landing';
    const option=VARIANT_OPTIONS.find((item)=>item.shape===shape&&item.side===side&&item.variant===variant)||VARIANT_OPTIONS[1]; return {mode,shape,side,variant,optionKey:option.key};
  }
  function optionToState(key,currentMode){ const option=VARIANT_OPTIONS.find((item)=>item.key===key)||VARIANT_OPTIONS[1]; return {mode:option.variant==='empty'?'empty':currentMode,shape:option.shape,side:option.side,variant:option.variant,optionKey:option.key}; }
  function saveState(st){ write('site_situation',st.mode==='ready'?'Готовый металлокаркас':'Пустой проём'); const opening=st.shape==='straight'?'Прямой':st.shape==='u'?'П-образный':`Г-образный ${st.side==='right'?'правый':'левый'}`; write('opening_type',opening); write('turn_type',st.variant==='winder'?'Забежные':'Площадка'); write('turn_side',st.side==='right'?'Правый':'Левый'); write('stair_shape',st.shape); write('zamer_scheme_template',`${st.mode}_${st.shape}_${st.variant}_${st.side}`); }
  function hideLegacy(panelEl){ Array.from(panelEl.children).forEach((el)=>{ if(el.id!==ROOT_ID) el.classList.add('se-hidden-legacy'); }); }
  function v(name,fallback){ return read(name,fallback); }
  function valueBox(x,y,text,w=88,h=36){ return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#fff" stroke="#cbd5e1" stroke-width="2"/><text x="${x+w/2}" y="${y+23}" text-anchor="middle" font-size="18" font-weight="950" fill="#14213d">${text}</text>`; }
  function defs(){ return `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#263b5a"/></marker><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#334155" flood-opacity="0.10"/></filter><pattern id="smallGrid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#f1f5f9" stroke-width="1"/></pattern></defs>`; }
  function dimLine(x1,y1,x2,y2,label,value,unit='мм',color='#263b5a'){ const tx=(x1+x2)/2; const ty=(y1+y2)/2; const vertical=Math.abs(y2-y1)>Math.abs(x2-x1); const vb=vertical?valueBox(tx-40,ty-18,value,80,36):valueBox(tx-50,ty-18,value,100,36); const caption=vertical?`<text x="${tx-56}" y="${ty-26}" text-anchor="middle" font-size="13" font-weight="900" fill="${color}" transform="rotate(-90 ${tx-56} ${ty-26})">${label}</text>`:`<text x="${tx}" y="${ty-34}" text-anchor="middle" font-size="13" font-weight="900" fill="${color}">${label}</text>`; const unitText=vertical?`<text x="${tx+46}" y="${ty+5}" font-size="12" font-weight="900" fill="${color}">${unit}</text>`:`<text x="${tx+62}" y="${ty+5}" font-size="12" font-weight="900" fill="${color}">${unit}</text>`; return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" marker-start="url(#arrow)" marker-end="url(#arrow)"/>${caption}${vb}${unit?unitText:''}`; }

  function emptySvg(st){
    const mirror=st.side==='right'?'translate(900 0) scale(-1 1)':''; const route=st.shape==='straight'?'M190 370 H700':st.shape==='u'?'M210 420 V150 H700 V420':'M235 430 V160 H705';
    return `<svg viewBox="0 0 900 640" role="img" aria-label="Пустой проём">${defs()}<rect x="0" y="0" width="900" height="640" fill="#fff"/><rect x="34" y="34" width="832" height="572" rx="16" fill="url(#smallGrid)" stroke="#d5dfec" stroke-width="2"/><text x="62" y="78" font-size="22" font-weight="950" fill="#08142f">ПУСТОЙ ПРОЁМ</text><text x="62" y="105" font-size="14" font-weight="850" fill="#64748b">Вид сверху: форма проёма, старт, выход, габариты</text><g transform="${mirror}" fill="none" stroke="#08142f" stroke-width="28" stroke-linecap="square" stroke-linejoin="miter" filter="url(#soft)"><path d="${route}"/></g><g transform="${mirror}"><rect x="175" y="470" width="78" height="58" rx="8" fill="none" stroke="#b7c6d9" stroke-width="2" stroke-dasharray="8 7"/><text x="214" y="506" text-anchor="middle" font-size="16" font-weight="950" fill="#2563eb">СТАРТ</text><line x1="214" y1="468" x2="214" y2="436" stroke="#2563eb" stroke-width="4" marker-end="url(#arrow)"/><rect x="685" y="125" width="80" height="58" rx="8" fill="none" stroke="#b7c6d9" stroke-width="2" stroke-dasharray="8 7"/><text x="725" y="160" text-anchor="middle" font-size="16" font-weight="950" fill="#2563eb">ВЫХОД</text><line x1="682" y1="154" x2="650" y2="154" stroke="#2563eb" stroke-width="4" marker-end="url(#arrow)"/></g>${dimLine(185,555,705,555,'Длина проёма',v('opening_length_mm','2223'))}${dimLine(116,160,116,430,'Ширина проёма',v('opening_width_mm','2223'))}${dimLine(810,160,810,430,'Высота',v('height_clean_to_clean_mm','3267'))}<text x="744" y="540" font-size="14" font-weight="850" fill="#64748b">T = ${v('slab_thickness_mm','120')} мм</text><text x="744" y="565" font-size="14" font-weight="850" fill="#64748b">B = ${v('desired_flight_width_mm','900')} мм</text></svg>`;
  }

  function straightSvg(){
    const steps=Array.from({length:10}).map((_,i)=>`<line x1="${230+i*44}" y1="270" x2="${230+i*44}" y2="410" stroke="#8ea3c0" stroke-width="2"/>`).join('');
    return `<svg viewBox="0 0 900 640" role="img" aria-label="Прямая лестница">${defs()}<rect width="900" height="640" fill="#fff"/><rect x="34" y="34" width="832" height="572" rx="16" fill="#fff" stroke="#d5dfec" stroke-width="2"/><text x="62" y="78" font-size="22" font-weight="950" fill="#08142f">ПРЯМАЯ ЛЕСТНИЦА</text><text x="62" y="105" font-size="14" font-weight="850" fill="#64748b">Вид сверху: один марш, старт и выход</text><g filter="url(#soft)"><rect x="230" y="270" width="440" height="140" fill="#fff" stroke="#08142f" stroke-width="5"/>${steps}<text x="450" y="442" text-anchor="middle" font-size="14" font-weight="950" fill="#31476b">Марш 1</text>${valueBox(418,450,v('visual_steps_1','8'),64,34)}<text x="486" y="472" font-size="12" font-weight="900" fill="#31476b">ст</text><text x="198" y="350" font-size="13" font-weight="900" fill="#31476b">Старт</text><line x1="218" y1="340" x2="250" y2="340" stroke="#263b5a" stroke-width="4" marker-end="url(#arrow)"/><text x="690" y="350" font-size="13" font-weight="900" fill="#31476b">Выход</text><line x1="670" y1="340" x2="720" y2="340" stroke="#263b5a" stroke-width="4" marker-end="url(#arrow)"/></g>${dimLine(230,215,670,215,'Длина проёма',v('opening_length_mm','2223'))}${dimLine(704,270,704,410,'Ширина марша',v('flight1_width_mm','826'))}${dimLine(150,220,150,465,'Высота',v('height_clean_to_clean_mm','3267'))}<text x="355" y="545" font-size="14" font-weight="900" fill="#31476b">Подступёнок ${v('visual_riser_mm','204')} мм · Проступь ${v('visual_tread_mm','275')} мм</text></svg>`;
  }

  function lSvg(st){
    const mirror=st.side==='right'?'translate(900 0) scale(-1 1)':''; const isWinder=st.variant==='winder'; const step1=Array.from({length:8}).map((_,i)=>`<line x1="250" y1="${260+i*30}" x2="380" y2="${260+i*30}" stroke="#8ea3c0" stroke-width="2"/>`).join(''); const step2=Array.from({length:7}).map((_,i)=>`<line x1="${420+i*38}" y1="185" x2="${420+i*38}" y2="290" stroke="#8ea3c0" stroke-width="2"/>`).join(''); const winder=isWinder?Array.from({length:6}).map((_,i)=>`<line x1="250" y1="185" x2="${380-i*22}" y2="${290-i*17}" stroke="#8ea3c0" stroke-width="2"/>`).join(''):`<text x="315" y="237" text-anchor="middle" font-size="17" font-weight="950" fill="#31476b">Площадка</text>${valueBox(275,246,v('landing_length_mm','1200'),88,36)}<text x="370" y="269" font-size="12" font-weight="900" fill="#31476b">мм</text>`;
    return `<svg viewBox="0 0 900 640" role="img" aria-label="Г-образная лестница">${defs()}<rect width="900" height="640" fill="#fff"/><rect x="34" y="34" width="832" height="572" rx="16" fill="#fff" stroke="#d5dfec" stroke-width="2"/><text x="62" y="78" font-size="22" font-weight="950" fill="#08142f">Г-ОБРАЗНАЯ ${st.side==='right'?'ПРАВАЯ':'ЛЕВАЯ'}</text><text x="62" y="105" font-size="14" font-weight="850" fill="#64748b">Марш 1, ${isWinder?'забежные ступени':'площадка'}, марш 2</text><g transform="${mirror}" filter="url(#soft)"><rect x="250" y="290" width="130" height="260" fill="#fff" stroke="#08142f" stroke-width="5"/>${step1}<rect x="250" y="185" width="170" height="105" fill="#fff" stroke="#08142f" stroke-width="5"/>${winder}<rect x="420" y="185" width="295" height="105" fill="#fff" stroke="#08142f" stroke-width="5"/>${step2}<text x="727" y="245" font-size="13" font-weight="900" fill="#31476b">Выход</text><line x1="715" y1="260" x2="770" y2="260" stroke="#263b5a" stroke-width="3" marker-end="url(#arrow)"/><text x="225" y="530" text-anchor="middle" font-size="13" font-weight="900" fill="#31476b">Старт</text><line x1="250" y1="520" x2="250" y2="475" stroke="#263b5a" stroke-width="4" marker-end="url(#arrow)"/><text x="318" y="520" text-anchor="middle" font-size="14" font-weight="950" fill="#31476b">Марш 1</text>${valueBox(287,528,v('visual_steps_1','8'),64,34)}<text x="355" y="550" font-size="12" font-weight="900" fill="#31476b">ст</text><text x="596" y="315" text-anchor="middle" font-size="14" font-weight="950" fill="#31476b">Марш 2</text>${valueBox(565,323,v('visual_steps_2','4'),64,34)}<text x="633" y="345" font-size="12" font-weight="900" fill="#31476b">ст</text>${isWinder?`<text x="365" y="333" text-anchor="middle" font-size="14" font-weight="950" fill="#31476b">Забежные</text>${valueBox(332,342,v('visual_winder_steps','5'),66,34)}<text x="404" y="364" font-size="12" font-weight="900" fill="#31476b">шт</text>`:''}</g>${dimLine(250,145,715,145,'Длина проёма',v('opening_length_mm','2223'))}${dimLine(180,185,180,550,'Высота',v('height_clean_to_clean_mm','3267'))}${dimLine(756,185,756,290,'Ширина марша 2',v('flight2_width_mm','941'))}${dimLine(792,185,792,550,'Ширина проёма',v('opening_width_mm','2223'))}${dimLine(250,590,380,590,'Ширина марша 1',v('flight1_width_mm','826'))}<text x="435" y="580" font-size="13" font-weight="900" fill="#31476b">h ${v('visual_riser_mm','204')} мм · b ${v('visual_tread_mm','275')} мм</text></svg>`;
  }

  function uSvg(){
    const step1=Array.from({length:7}).map((_,i)=>`<line x1="250" y1="${285+i*32}" x2="370" y2="${285+i*32}" stroke="#8ea3c0" stroke-width="2"/>`).join('');
    const step2=Array.from({length:7}).map((_,i)=>`<line x1="530" y1="${285+i*32}" x2="650" y2="${285+i*32}" stroke="#8ea3c0" stroke-width="2"/>`).join('');
    return `<svg viewBox="0 0 900 640" role="img" aria-label="П-образная лестница">${defs()}<rect width="900" height="640" fill="#fff"/><rect x="34" y="34" width="832" height="572" rx="16" fill="#fff" stroke="#d5dfec" stroke-width="2"/><text x="62" y="78" font-size="22" font-weight="950" fill="#08142f">П-ОБРАЗНАЯ ЛЕСТНИЦА</text><text x="62" y="105" font-size="14" font-weight="850" fill="#64748b">Два параллельных марша и разворотная площадка</text><g filter="url(#soft)"><rect x="250" y="260" width="120" height="250" fill="#fff" stroke="#08142f" stroke-width="5"/>${step1}<rect x="370" y="160" width="160" height="100" fill="#fff" stroke="#08142f" stroke-width="5"/><text x="450" y="220" text-anchor="middle" font-size="17" font-weight="950" fill="#31476b">Площадка</text><rect x="530" y="260" width="120" height="250" fill="#fff" stroke="#08142f" stroke-width="5"/>${step2}<text x="220" y="500" font-size="13" font-weight="900" fill="#31476b">Старт</text><line x1="250" y1="500" x2="250" y2="460" stroke="#263b5a" stroke-width="4" marker-end="url(#arrow)"/><text x="668" y="280" font-size="13" font-weight="900" fill="#31476b">Выход</text><line x1="650" y1="280" x2="705" y2="280" stroke="#263b5a" stroke-width="4" marker-end="url(#arrow)"/></g>${dimLine(250,125,650,125,'Длина проёма',v('opening_length_mm','2223'))}${dimLine(180,160,180,510,'Высота',v('height_clean_to_clean_mm','3267'))}${dimLine(700,260,700,510,'Ширина проёма',v('opening_width_mm','2223'))}${dimLine(250,550,370,550,'Ширина марша 1',v('flight1_width_mm','826'))}${dimLine(530,550,650,550,'Ширина марша 2',v('flight2_width_mm','941'))}<text x="390" y="585" font-size="13" font-weight="900" fill="#31476b">N1 ${v('visual_steps_1','8')} шт · N2 ${v('visual_steps_2','4')} шт · h ${v('visual_riser_mm','204')} мм · b ${v('visual_tread_mm','275')} мм</text></svg>`;
  }

  function readySvg(st){ if(st.shape==='straight') return straightSvg(st); if(st.shape==='u') return uSvg(st); return lSvg(st); }
  function rowsForState(st){ if(st.mode==='empty') return EMPTY_FIELDS; return st.shape==='straight' ? READY_BASE_FIELDS : READY_BASE_FIELDS.concat(READY_EXTRA_FIELDS); }
  function fieldRows(rows){ return rows.map((item)=>`<label class="tzm-field"><strong class="tzm-code">${item.code}</strong><span class="tzm-label">${item.label}</span><input data-sync-field="${item.name}" value="${read(item.name,item.fallback)}" placeholder="${item.fallback}" autocomplete="off" inputmode="numeric"/><em class="tzm-unit">${item.unit}</em></label>`).join(''); }

  function render(root,st){
    const rows=rowsForState(st); const selectedOption=VARIANT_OPTIONS.find((item)=>item.shape===st.shape&&item.side===st.side&&item.variant===st.variant)||VARIANT_OPTIONS[1];
    root.innerHTML=`<div class="tzm-board"><section class="tzm-work-card"><div class="tzm-top"><div class="tzm-mode"><button type="button" data-mode="empty" aria-pressed="${st.mode==='empty'}">Пустой проём</button><button type="button" data-mode="ready" aria-pressed="${st.mode==='ready'}">Готовый каркас</button></div><label class="tzm-variant"><span>Вариант лестницы</span><select data-variant-select>${VARIANT_OPTIONS.map((item)=>`<option value="${item.key}" ${item.key===selectedOption.key?'selected':''}>${item.label}</option>`).join('')}</select></label></div><div class="tzm-drawing">${st.mode==='ready'?readySvg(st):emptySvg(st)}</div><div class="tzm-comment"><label>Комментарий</label><textarea data-sync-field="obstacles_comment" placeholder="Добавьте комментарий к замеру: ограничения, стены, трубы, окна, где нельзя крепиться...">${read('obstacles_comment')}</textarea></div></section><aside class="tzm-side"><h3>${st.mode==='ready'?'Параметры лестницы':'Параметры проёма'}</h3><div class="tzm-fields">${fieldRows(rows)}</div><div class="tzm-info">Теперь у каждого варианта своя схема: прямая, Г-образная левая/правая, забежная и П-образная.</div><div class="tzm-actions"><button type="button" class="primary" data-submit-proxy>Сохранить</button><button type="button" data-review-proxy>Отправить на проверку</button></div></aside></div>`;
    root.querySelectorAll('[data-mode]').forEach((btn)=>btn.addEventListener('click',()=>update({mode:btn.dataset.mode})));
    root.querySelector('[data-variant-select]')?.addEventListener('change',(event)=>update(optionToState(event.target.value,stateFromForm().mode)));
    root.querySelectorAll('[data-sync-field]').forEach((el)=>el.addEventListener('input',()=>{write(el.dataset.syncField,el.value); if(el.tagName==='INPUT') render(root,stateFromForm());}));
    root.querySelector('[data-submit-proxy]')?.addEventListener('click',()=>form()?.requestSubmit()); root.querySelector('[data-review-proxy]')?.addEventListener('click',()=>document.querySelector('#send-review-btn')?.click());
  }
  function update(patch){ const root=document.getElementById(ROOT_ID); if(!root)return; const st={...stateFromForm(),...patch}; saveState(st); render(root,st); }
  function init(){ const panelEl=panel(); if(!panelEl||document.getElementById(ROOT_ID))return; injectStyle(); const root=document.createElement('section'); root.id=ROOT_ID; panelEl.prepend(root); hideLegacy(panelEl); const st={...stateFromForm()}; saveState(st); render(root,st); }
  const observer=new MutationObserver(init); observer.observe(document.body,{childList:true,subtree:true}); if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();

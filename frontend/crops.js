/* ============================================================
   LUMIA Farm — Crop sprite engine (shared)
   30 chibi pixel-art crops drawn on <canvas>, matching the
   game's technique: rect-based art on a soil mound / trunk.
   Exposes window.LumiaCrops {
     TIERS, CROPS, FEED, HUNGER, drawCrop, drawMound
   }
   ============================================================ */
(function () {

  // ---- tier metadata (6 tiers) -----------------------------------------
  const TIERS = {
    T1: { key:'T1', label:'T1', name:'새싹 작물',   color:'#7cb342', soft:'#eaf4d8', ring:'#b7d78a', text:'#4a6b1e', grow:'5~20분',     regrow:'없음' },
    T2: { key:'T2', label:'T2', name:'텃밭 작물',   color:'#3fae9a', soft:'#dcf1ec', ring:'#a4ddd2', text:'#1c6b5e', grow:'30분~1.5시간', regrow:'없음' },
    T3: { key:'T3', label:'T3', name:'과실 작물',   color:'#4f8fd6', soft:'#dcebfa', ring:'#a7cbea', text:'#1c4f7e', grow:'2~6시간',     regrow:'없음' },
    T4: { key:'T4', label:'T4', name:'덩굴·나무',   color:'#9a6ce0', soft:'#ece0fb', ring:'#c9abee', text:'#5a2f9e', grow:'8~12시간',    regrow:'2~4시간' },
    T5: { key:'T5', label:'T5', name:'농원 작물',   color:'#e08a2f', soft:'#fbe8cc', ring:'#f2c98e', text:'#8a5210', grow:'16~24시간',   regrow:'6~10시간' },
    T6: { key:'T6', label:'T6', name:'과수원 작물', color:'#e0b52f', soft:'#fbf1c9', ring:'#f0dd8e', text:'#8a6a10', grow:'30~42시간',   regrow:'14~24시간' },
  };

  // ---- crop catalog (30) -----------------------------------------------
  // form drives the sprite shape; leaf/leaf2/fruit/fruit2/dark are palette.
  // grow/regrow are display strings (min hours already computed).
  const CROPS = [
    // ---------- T1 (single harvest) ----------
    { id:'carrot',   name:'당근',   emoji:'🥕', tier:'T1', num:1,  grow:'5분',      regrow:null, form:'root',   leaf:'#5fbf3f', leaf2:'#7ed659', fruit:'#ff8a3d', fruit2:'#ffb066', dark:'#d96a1c' },
    { id:'radish',   name:'무',     emoji:'🌰', tier:'T1', num:2,  grow:'8분',      regrow:null, form:'root',   leaf:'#63c24e', leaf2:'#82d668', fruit:'#f4f0ea', fruit2:'#ffffff', dark:'#cdd6c0', tip:'#c7e26a' },
    { id:'lettuce',  name:'상추',   emoji:'🥬', tier:'T1', num:3,  grow:'12분',     regrow:null, form:'head',   leaf:'#5fbf3f', leaf2:'#8ed85a', fruit:'#a7e06a', fruit2:'#c7ee8f', dark:'#4a9330' },
    { id:'potato',   name:'감자',   emoji:'🥔', tier:'T1', num:4,  grow:'15분',     regrow:null, form:'tuber',  leaf:'#5aa838', leaf2:'#77c250', fruit:'#c9a06a', fruit2:'#ddbb88', dark:'#8a6640' },
    { id:'onion',    name:'양파',   emoji:'🧅', tier:'T1', num:5,  grow:'20분',     regrow:null, form:'bulb',   leaf:'#67c04a', leaf2:'#88d666', fruit:'#c98fd0', fruit2:'#e3b8e8', dark:'#9a5aa2' },

    // ---------- T2 (single harvest) ----------
    { id:'tomato',   name:'토마토', emoji:'🍅', tier:'T2', num:6,  grow:'30분',     regrow:null, form:'stake',  leaf:'#4faa38', leaf2:'#69c452', fruit:'#ef3d34', fruit2:'#ff6e5a', dark:'#c01f18' },
    { id:'corn',     name:'옥수수', emoji:'🌽', tier:'T2', num:7,  grow:'45분',     regrow:null, form:'corn',   leaf:'#5aae3a', leaf2:'#77c852', fruit:'#f2cf4a', fruit2:'#ffe988', dark:'#c99a2a' },
    { id:'cucumber', name:'오이',   emoji:'🥒', tier:'T2', num:8,  grow:'1시간',    regrow:null, form:'hang',   leaf:'#4faa38', leaf2:'#69c452', fruit:'#3f9a3a', fruit2:'#67c24e', dark:'#2f7028' },
    { id:'broccoli', name:'브로콜리', emoji:'🥦', tier:'T2', num:9, grow:'1시간 15분', regrow:null, form:'floret', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#3f7d3a', fruit2:'#56a04e', dark:'#2c5e28' },
    { id:'pumpkin',  name:'호박',   emoji:'🎃', tier:'T2', num:10, grow:'1시간 30분', regrow:null, form:'gourd', leaf:'#4aa838', leaf2:'#63c24e', fruit:'#ff9326', fruit2:'#ffb35a', dark:'#d86c12' },

    // ---------- T3 (single harvest) ----------
    { id:'watermelon', name:'수박', emoji:'🍉', tier:'T3', num:11, grow:'2시간',   regrow:null, form:'gourd',  leaf:'#4aa838', leaf2:'#63c24e', fruit:'#3f8a3a', fruit2:'#67b24e', dark:'#245a20', stripe:'#1f4a1c' },
    { id:'melon',    name:'멜론',   emoji:'🍈', tier:'T3', num:12, grow:'3시간',   regrow:null, form:'gourd',  leaf:'#4aa838', leaf2:'#63c24e', fruit:'#b7c86a', fruit2:'#d4e090', dark:'#8a9a4a', stripe:'#e6eec0' },
    { id:'strawberry', name:'딸기', emoji:'🍓', tier:'T3', num:13, grow:'4시간',   regrow:null, form:'berry',  leaf:'#4fb53a', leaf2:'#69cf52', fruit:'#ef3d54', fruit2:'#ff6e80', dark:'#c01f37' },
    { id:'blueberry', name:'블루베리', emoji:'🫐', tier:'T3', num:14, grow:'5시간', regrow:null, form:'berry',  leaf:'#4fa53a', leaf2:'#69bf52', fruit:'#4a6ed6', fruit2:'#7a94ee', dark:'#2c3f9a' },
    { id:'chili',    name:'고추',   emoji:'🌶️', tier:'T3', num:15, grow:'6시간',   regrow:null, form:'stake',  leaf:'#4faa38', leaf2:'#69c452', fruit:'#e23423', fruit2:'#ff5f47', dark:'#a81f14' },

    // ---------- T4 (regrow 2~4h) ----------
    { id:'grape',    name:'포도',       emoji:'🍇', tier:'T4', num:16, grow:'8시간',  regrow:'2시간',    form:'vine', leaf:'#4faa38', leaf2:'#69c452', fruit:'#8a5cd0', fruit2:'#b48ce8', dark:'#5a349a' },
    { id:'tomatotree', name:'토마토나무', emoji:'🍅', tier:'T4', num:17, grow:'9시간', regrow:'2시간 30분', form:'tree', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#ef3d34', fruit2:'#ff6e5a', dark:'#7a4a24' },
    { id:'strawbush', name:'딸기덤불',   emoji:'🍓', tier:'T4', num:18, grow:'10시간', regrow:'3시간',    form:'bush', leaf:'#4fb53a', leaf2:'#69cf52', fruit:'#ef3d54', fruit2:'#ff6e80', dark:'#3a7d28' },
    { id:'blueberrybush', name:'블루베리덤불', emoji:'🫐', tier:'T4', num:19, grow:'11시간', regrow:'3시간 30분', form:'bush', leaf:'#4fa53a', leaf2:'#69bf52', fruit:'#4a6ed6', fruit2:'#7a94ee', dark:'#3a7028' },
    { id:'chilitree', name:'고추나무',   emoji:'🌶️', tier:'T4', num:20, grow:'12시간', regrow:'4시간',   form:'tree', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#e23423', fruit2:'#ff5f47', dark:'#7a4a24' },

    // ---------- T5 (regrow 6~10h) ----------
    { id:'coffee',   name:'커피',   emoji:'☕', tier:'T5', num:21, grow:'16시간', regrow:'6시간',  form:'bush', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#d23a2a', fruit2:'#f06450', dark:'#3a6e2c' },
    { id:'cacao',    name:'카카오', emoji:'🍫', tier:'T5', num:22, grow:'18시간', regrow:'6시간',  form:'pod',  leaf:'#3f8a34', leaf2:'#57a848', fruit:'#d98a3a', fruit2:'#e8a860', dark:'#7a4a1c' },
    { id:'tea',      name:'차나무', emoji:'🍵', tier:'T5', num:23, grow:'20시간', regrow:'7시간',  form:'bush', leaf:'#3f8a34', leaf2:'#5aa848', fruit:'#f4f0e4', fruit2:'#ffffff', dark:'#2c5e24', flower:true },
    { id:'banana',   name:'바나나', emoji:'🍌', tier:'T5', num:24, grow:'22시간', regrow:'10시간', form:'palm', leaf:'#4fa03a', leaf2:'#69bf52', fruit:'#f4d24a', fruit2:'#ffe988', dark:'#6a4a24' },
    { id:'lemon',    name:'레몬',   emoji:'🍋', tier:'T5', num:25, grow:'24시간', regrow:'10시간', form:'tree', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#f4d63a', fruit2:'#ffee78', dark:'#7a4a24' },

    // ---------- T6 (regrow 14~24h) ----------
    { id:'apple',    name:'사과',   emoji:'🍎', tier:'T6', num:26, grow:'30시간', regrow:'14시간', form:'tree', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#e63a34', fruit2:'#ff6a5a', dark:'#7a4a24' },
    { id:'peach',    name:'복숭아', emoji:'🍑', tier:'T6', num:27, grow:'33시간', regrow:'14시간', form:'tree', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#ff9ea0', fruit2:'#ffc4b0', dark:'#7a4a24' },
    { id:'cherry',   name:'체리',   emoji:'🍒', tier:'T6', num:28, grow:'36시간', regrow:'18시간', form:'tree', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#d62340', fruit2:'#f0546a', dark:'#7a4a24' },
    { id:'mango',    name:'망고',   emoji:'🥭', tier:'T6', num:29, grow:'39시간', regrow:'20시간', form:'tree', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#f2a52f', fruit2:'#ffcf5a', dark:'#7a4a24' },
    { id:'goldenapple', name:'황금사과', emoji:'🍏', tier:'T6', num:30, grow:'42시간', regrow:'24시간', form:'tree', leaf:'#3f8a34', leaf2:'#57a848', fruit:'#f6c62a', fruit2:'#ffe884', dark:'#8a6a1c', golden:true },
  ];

  // ---- animal feed spec -------------------------------------------------
  // hunger[] & satiety[] are [Common, Rare, Epic, Legendary]
  const FEED = [
    { id:'carrot',     hunger:[80,20,0,0],       satiety:[10,5,0,0] },
    { id:'lettuce',    hunger:[80,20,0,0],       satiety:[10,5,0,0] },
    { id:'tomato',     hunger:[100,40,0,0],      satiety:[20,10,0,0] },
    { id:'corn',       hunger:[100,40,0,0],      satiety:[20,10,0,0] },
    { id:'watermelon', hunger:[100,80,30,0],     satiety:[30,20,5,0] },
    { id:'blueberry',  hunger:[100,80,30,0],     satiety:[30,20,5,0] },
    { id:'grape',      hunger:[100,80,60,30],    satiety:[40,30,10,5] },
    { id:'banana',     hunger:[100,80,60,50],    satiety:[50,40,30,20] },
    { id:'apple',      hunger:[100,100,100,100], satiety:[80,70,60,50] },
  ];

  // ---- hunger drain per rarity (100 → 0) --------------------------------
  const HUNGER = [
    { grade:'커먼',     key:'Common',    color:'#7fa844', soft:'#eaf4d8', drain:'30분', secs:1800 },
    { grade:'레어',     key:'Rare',      color:'#3f9fd6', soft:'#dcedfa', drain:'1시간', secs:3600 },
    { grade:'에픽',     key:'Epic',      color:'#9a68e0', soft:'#ece0fb', drain:'2시간', secs:7200 },
    { grade:'레전더리', key:'Legendary', color:'#f0a52f', soft:'#fdeac7', drain:'3시간', secs:10800 },
  ];

  // ---- pixel helpers ----------------------------------------------------
  function shade(hex, amt){
    const n=parseInt(hex.slice(1),16); let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
    r=Math.max(0,Math.min(255,r+amt)); g=Math.max(0,Math.min(255,g+amt)); b=Math.max(0,Math.min(255,b+amt));
    return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
  }

  // draw a crop, centred so its base sits on the mound at (cx, groundY)
  function drawCrop(ctx, cropId, cx, groundY, scale, opts){
    opts = opts || {};
    const c = typeof cropId==='string' ? CROPS.find(x=>x.id===cropId) : cropId;
    if(!c) return;
    const s = scale||1, t = opts.t||0;
    const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false;
    const sway = Math.sin(t*1.6 + (opts.phase||0))*(opts.wind===false?0:1.1);

    ctx.save();
    ctx.translate(Math.round(cx), Math.round(groundY));
    ctx.scale(s, s);

    if(opts.mound!==false) drawMound(ctx, c.form);

    ctx.translate(sway, 0);
    const P=(x,y,w,h,col)=>{ ctx.fillStyle=col; ctx.fillRect(Math.round(x),Math.round(y),w,h); };
    const forms = FORMS[c.form] || FORMS.head;
    forms(ctx, c, P, t);
    ctx.restore();

    ctx.imageSmoothingEnabled = prev;
  }

  // ---- harvested-produce icon: just the edible fruit, centred at (cx,cy) ----
  function drawFruit(ctx, cropId, cx, cy, scale){
    const c = typeof cropId==='string' ? CROPS.find(x=>x.id===cropId) : cropId;
    if(!c) return;
    const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.scale(scale||1, scale||1);
    const P=(x,y,w,h,col)=>{ ctx.fillStyle=col; ctx.fillRect(Math.round(x),Math.round(y),w,h); };
    const key = FRUIT_OF[c.id] || 'round';
    (FRUIT[key]||FRUIT.round)(ctx, c, P);
    ctx.restore();
    ctx.imageSmoothingEnabled = prev;
  }

  // which fruit painter each crop harvests as
  const FRUIT_OF = {
    carrot:'carrot', radish:'radish', lettuce:'lettuce', potato:'potato', onion:'onion',
    tomato:'round', tomatotree:'round', corn:'cob', cucumber:'cucumber', broccoli:'broccoli',
    pumpkin:'pumpkin', watermelon:'watermelon', melon:'melon',
    strawberry:'strawberry', strawbush:'strawberry',
    blueberry:'cluster', blueberrybush:'cluster', grape:'cluster',
    chili:'pepper', chilitree:'pepper', coffee:'coffeecluster', cacao:'cacaopod', tea:'tealeaf',
    banana:'banana', lemon:'round', apple:'round', peach:'round', cherry:'cherry',
    mango:'round', goldenapple:'round',
  };

  // fruit painters — produce drawn centred at origin, ~±13px extent
  const FRUIT = {
    round(ctx, c, P){ // tomato / apple / lemon / peach / mango / golden apple
      P(-9,-7,18,15,c.fruit);
      P(-10,-4,20,10,c.fruit);
      P(-8,-9,16,4,c.fruit2);
      P(-9,-6,4,4,c.fruit2);              // highlight
      P(5,3,4,3,shade(c.fruit,-28));      // shade
      P(-1,-11,2,4,c.dark);               // stem
      P(1,-11,4,3,c.leaf2); P(-5,-10,4,2,c.leaf2); // leaf
      if(c.golden){ P(-11,-9,1,3,'#fff'); P(-12,-8,3,1,'#fff'); }
    },
    carrot(ctx, c, P){
      P(-3,-11,6,4,c.leaf2); P(-6,-12,3,3,c.leaf); P(3,-12,3,3,c.leaf); P(-1,-14,2,4,c.leaf);
      for(let i=0;i<13;i++){ const w=Math.max(2,10-i); P(-w/2,-7+i,w,1,c.fruit); }
      P(-4,-7,8,2,c.fruit2);
      for(let y=-5;y<3;y+=2) P(-2,y,3,1,shade(c.fruit,25));
    },
    radish(ctx, c, P){
      P(-2,-13,4,4,c.leaf2); P(-6,-13,3,3,c.leaf); P(3,-13,3,3,c.leaf);
      P(-8,-8,16,14,c.fruit); P(-9,-5,18,9,c.fruit); P(-7,-10,14,4,c.fruit2);
      P(-6,-7,4,4,c.fruit2); P(0,6,2,3,shade(c.dark,-10));
    },
    lettuce(ctx, c, P){
      P(-11,-6,22,13,c.dark); P(-12,-3,24,9,c.leaf); P(-9,-10,18,7,c.leaf2);
      P(-6,-12,12,4,c.leaf); P(-5,-6,10,7,c.fruit2);
      P(-11,-7,5,5,c.leaf2); P(6,-7,5,5,c.leaf2);
    },
    potato(ctx, c, P){
      P(-11,-6,22,13,c.fruit); P(-12,-2,24,8,c.fruit); P(-9,-8,17,5,c.fruit2);
      P(-6,-3,2,1,c.dark); P(3,1,2,1,c.dark); P(-1,-1,2,1,c.dark); P(6,-4,2,1,c.dark);
    },
    onion(ctx, c, P){
      P(-2,-13,4,5,c.leaf); P(-5,-12,3,4,c.leaf2); P(4,-12,3,4,c.leaf2);
      P(-9,-6,18,13,c.fruit); P(-10,-2,20,8,c.fruit); P(-6,4,12,3,c.fruit);
      P(-8,-8,14,4,c.fruit2); P(-4,-6,3,10,shade(c.fruit,-25)); P(3,-6,3,10,shade(c.fruit,-25));
    },
    cob(ctx, c, P){ // corn
      P(-6,-12,12,22,c.fruit); P(-7,-9,14,16,c.fruit); P(-6,-12,12,3,c.fruit2);
      for(let y=-10;y<9;y+=3){ for(let x=-5;x<6;x+=4){ P(x,y,3,2,shade(c.fruit,24)); } }
      P(-8,-11,4,16,c.leaf); P(5,-9,4,15,c.leaf2); P(-3,-14,6,4,c.leaf2);
    },
    cucumber(ctx, c, P){
      P(-4,-13,9,26,c.fruit); P(-5,-9,11,18,c.fruit); P(-4,-13,9,4,c.fruit2);
      for(let y=-10;y<10;y+=3) P(-2,y,2,1,shade(c.fruit,26));
      P(6,-12,2,3,shade(c.fruit,-25)); P(-1,-15,2,3,c.leaf2);
    },
    broccoli(ctx, c, P){
      P(-3,-2,6,11,c.leaf2);
      P(-11,-12,22,11,c.fruit); P(-8,-15,16,5,c.fruit2); P(-4,-17,8,4,c.fruit);
      for(const [x,y] of [[-9,-10],[6,-10],[-3,-15],[3,-13],[0,-9],[-6,-6],[4,-5]]) P(x,y,3,3,shade(c.fruit,-24));
    },
    pumpkin(ctx, c, P){
      P(-1,-13,2,5,'#6b4a1f');
      P(-12,-7,24,15,c.fruit); P(-13,-3,26,9,c.fruit); P(-10,-9,20,4,c.fruit2);
      for(const x of [-8,-2,4]) P(x,-6,2,13,c.dark);
      P(-12,-7,24,2,shade(c.fruit,22));
    },
    watermelon(ctx, c, P){
      P(-12,-8,24,16,c.fruit); P(-13,-4,26,10,c.fruit); P(-10,-10,20,4,c.fruit2);
      for(const x of [-9,-4,1,6]) P(x,-8,2,16,c.stripe||c.dark);
      P(-12,-8,24,2,shade(c.fruit,20));
    },
    melon(ctx, c, P){
      P(-12,-8,24,16,c.fruit); P(-13,-4,26,10,c.fruit); P(-10,-10,20,4,c.fruit2);
      for(const x of [-8,-2,4]) P(x,-8,1,16,c.stripe||'#e6eec0');
      for(let y=-7;y<7;y+=3) P(-11,y,22,1,c.stripe||'#e6eec0');
    },
    strawberry(ctx, c, P){
      P(-3,-13,6,4,c.leaf); P(-7,-12,4,3,c.leaf2); P(3,-12,4,3,c.leaf2); P(-1,-15,2,3,c.leaf);
      P(-8,-8,16,9,c.fruit); P(-6,1,12,5,c.fruit); P(-3,6,6,3,c.fruit);
      P(-8,-8,16,4,c.fruit2);
      for(const [x,y] of [[-5,-4],[2,-3],[-1,1],[4,2],[-4,3]]) P(x,y,1,1,'#ffe9a0');
    },
    cluster(ctx, c, P){ // grape / blueberry bunch
      P(-1,-14,2,3,c.leaf2); P(1,-14,4,2,c.leaf); P(-5,-13,4,2,c.leaf2);
      const rows=[[-4,-11,3],[-6,-8,4],[-4,-5,3],[-2,-2,2],[-1,1,1]];
      for(const [x,y,n] of rows){ for(let i=0;i<n;i++){ P(x+i*3,y,3,3,c.fruit); P(x+i*3,y,3,1,c.fruit2); P(x+i*3+2,y+2,1,1,c.dark); } }
    },
    pepper(ctx, c, P){ // chili
      P(-2,-13,5,3,c.leaf2); P(-1,-14,2,3,c.leaf);
      P(-3,-10,6,8,c.fruit); P(-2,-2,6,9,c.fruit); P(0,7,5,6,c.fruit);
      P(-3,-10,4,14,c.fruit2); P(3,-2,2,10,shade(c.fruit,-28));
    },
    cherry(ctx, c, P){
      P(-1,-13,2,7,c.dark); P(-6,-8,10,2,c.dark); P(1,-11,6,2,c.dark);
      P(-9,-5,8,8,c.fruit); P(-9,-5,8,3,c.fruit2); P(-3,1,2,2,shade(c.fruit,-28));
      P(2,-6,8,8,c.fruit); P(2,-6,8,3,c.fruit2); P(8,0,2,2,shade(c.fruit,-28));
    },
    banana(ctx, c, P){
      for(let i=0;i<3;i++){ const off=i*4-4;
        P(off-3,-8,4,10,c.fruit); P(off-3,2,4,3,c.fruit); P(off-4,-8,4,3,c.fruit2);
        P(off,-7,2,9,shade(c.fruit,-22)); P(off-3,5,3,2,shade(c.fruit,-30));
      }
      P(-6,-11,12,4,c.dark);
    },
    coffeecluster(ctx, c, P){
      P(-1,-12,2,3,c.leaf); P(2,-12,4,2,c.leaf2); P(-6,-11,4,2,c.leaf2);
      for(const [x,y] of [[-7,-8],[-1,-9],[4,-7],[-5,-2],[1,-3],[6,-1],[-2,3]]){ P(x,y,5,5,c.fruit); P(x,y,5,2,c.fruit2); P(x+3,y+3,1,1,c.dark); }
    },
    cacaopod(ctx, c, P){
      P(-6,-12,12,24,c.fruit); P(-7,-7,14,14,c.fruit); P(-6,-12,12,4,c.fruit2);
      for(const x of [-4,0,4]) P(x,-11,1,22,shade(c.fruit,-30));
      P(-2,-14,4,4,c.leaf2);
    },
    tealeaf(ctx, c, P){
      P(-2,-2,4,11,c.dark);
      for(const [x,y,f] of [[-10,-8,0],[3,-10,0],[-6,-13,1],[4,0,0],[-9,1,0]]){
        P(x,y,8,5,c.leaf); P(x,y,8,2,c.leaf2); P(x+3,y+1,1,3,shade(c.leaf,-24));
      }
      P(-2,-10,3,3,'#fff'); P(0,-9,2,2,'#f4d24a');
    },
  };

  function drawMound(ctx, form){
    // trees/palms get a small trunk-base plot; field crops a tilled mound
    ctx.fillStyle='rgba(40,22,8,.22)';
    ctx.beginPath(); ctx.ellipse(0, 1, 15, 4.5, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle='#7a4a24';
    ctx.beginPath(); ctx.ellipse(0, -1, 13, 4.5, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle='#8a5a2c';
    ctx.beginPath(); ctx.ellipse(0, -2.5, 11, 3.4, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle='rgba(255,210,150,.10)';
    ctx.beginPath(); ctx.ellipse(-2, -3.5, 6, 1.6, 0, 0, 6.28); ctx.fill();
  }

  // dark 2px outline via silhouette compositing would be heavy per-frame;
  // instead each form paints its own soft edge where useful.
  function leafFan(P, c, baseY){
    // upright leafy fronds used by root/leaf crops
    P(-1, baseY-16, 2, 16, c.leaf);
    P(-6, baseY-13, 2, 13, c.leaf2);
    P(4,  baseY-13, 2, 13, c.leaf2);
    P(-4, baseY-15, 2, 15, c.leaf);
    P(3,  baseY-15, 2, 15, c.leaf);
    P(-1, baseY-18, 2, 4, c.leaf2);
  }

  // ---- per-form art (origin at mound top, plant grows upward -y) --------
  const FORMS = {
    // carrots / radish — leafy top + tapered root peeking
    root(ctx, c, P, t){
      leafFan(P, c, -5);
      if(c.id==='radish'){ // round white bulb + green shoulder poking up
        for(let i=0;i<9;i++){ const w=(i<5? 6+i : 10-(i-4)*2); P(-w/2,-6+i,w,1, i<2? (c.tip||'#c7e26a') : c.fruit); }
        P(-4,-5,8,2,c.fruit2);
        P(-1,3,2,2,c.dark);
      } else { // carrot — chunky tapered orange root well above ground
        for(let i=0;i<11;i++){ const w=Math.max(2,9-i); P(-w/2,-7+i,w,1,c.fruit); }
        P(-4,-7,8,2,c.fruit2);
        for(let y=-5;y<2;y+=2) P(-2,y,4,1,shade(c.fruit,25)); // rib highlights
        P(-1,3,2,2,c.dark);
      }
    },
    // lettuce — layered leaf head
    head(ctx, c, P){
      P(-9,-8,18,10,c.dark);
      P(-10,-6,20,7,c.leaf);
      P(-8,-11,16,6,c.leaf2);
      P(-6,-13,12,4,c.leaf);
      P(-4,-8,8,6,c.fruit2);
      P(-9,-9,4,4,c.leaf2); P(5,-9,4,4,c.leaf2);
    },
    // potato — low leaves + tubers in soil
    tuber(ctx, c, P){
      P(-2,-12,2,10,c.leaf); P(-6,-9,3,3,c.leaf2); P(3,-9,3,3,c.leaf2);
      P(-5,-12,3,3,c.leaf); P(2,-12,3,3,c.leaf);
      P(-7,-2,6,5,c.fruit); P(1,-3,6,5,c.fruit2); P(-3,-1,5,4,c.fruit);
      P(-6,-1,2,1,c.dark); P(3,-2,2,1,c.dark);
    },
    // onion — tall shoots + bulb
    bulb(ctx, c, P){
      P(-1,-18,2,16,c.leaf); P(-4,-16,2,14,c.leaf2); P(3,-16,2,14,c.leaf2);
      P(-5,-3,10,7,c.fruit); P(-6,-1,12,4,c.fruit); P(-4,-5,8,3,c.fruit2);
      P(-1,0,2,3,c.dark);
      P(-3,-3,1,6,shade(c.fruit,-30)); P(2,-3,1,6,shade(c.fruit,-30));
    },
    // tomato / chili — staked plant w/ hanging fruit
    stake(ctx, c, P){
      P(-1,-20,2,20,shade(c.dark,40)); // stake
      P(0,-20,2,20,c.leaf);
      for(const [x,y] of [[-6,-15],[4,-14],[-5,-6],[3,-7]]) P(x,y,3,3,c.leaf2);
      if(c.id==='chili'){
        P(-6,-9,2,6,c.fruit); P(-6,-3,2,2,c.fruit2);
        P(4,-7,2,7,c.fruit); P(4,0,2,2,c.fruit2);
        P(-6,-10,2,1,c.leaf);
      } else {
        P(-7,-11,5,5,c.fruit); P(-7,-11,5,2,c.fruit2);
        P(3,-13,5,5,c.fruit); P(3,-13,5,2,c.fruit2);
        P(-2,-5,5,5,c.fruit); P(-2,-5,5,2,c.fruit2);
      }
    },
    // corn — tall stalk + cob
    corn(ctx, c, P){
      P(-1,-24,2,24,c.leaf);
      P(-7,-20,6,3,c.leaf2); P(1,-16,7,3,c.leaf2);
      P(-8,-12,7,3,c.leaf); P(1,-9,7,3,c.leaf);
      // cob
      P(2,-19,5,11,c.fruit); P(2,-19,5,11,c.fruit);
      for(let y=-18;y<-8;y+=2){ P(3,y,3,1,c.fruit2); }
      P(2,-20,5,2,c.leaf2); // husk top
    },
    // cucumber — vine + hanging long fruit
    hang(ctx, c, P){
      P(-1,-16,2,16,c.leaf);
      P(-6,-13,4,3,c.leaf2); P(3,-11,4,3,c.leaf2);
      P(-6,-9,2,10,c.fruit); P(-6,-9,2,10,c.fruit);
      P(-6,-9,2,3,c.fruit2); P(-6,1,2,2,shade(c.fruit,-25));
      P(3,-7,2,9,c.fruit); P(3,-7,2,3,c.fruit2);
      P(-6,-10,2,1,c.leaf);
    },
    // broccoli — thick stalk + floret dome
    floret(ctx, c, P){
      P(-2,-8,4,9,c.leaf2);
      P(-9,-16,18,9,c.fruit);
      P(-7,-19,14,5,c.fruit2);
      P(-4,-21,8,4,c.fruit);
      for(const [x,y] of [[-8,-15],[6,-15],[-3,-20],[3,-18],[0,-14]]) P(x,y,3,3,shade(c.fruit,-25));
      P(-9,-9,4,4,c.leaf); P(6,-9,4,4,c.leaf);
    },
    // pumpkin / watermelon / melon — big ground gourd
    gourd(ctx, c, P){
      P(-3,-16,2,6,c.leaf); P(-8,-15,5,3,c.leaf2); P(2,-16,6,3,c.leaf2);
      P(-11,-9,22,12,c.fruit);
      P(-12,-6,24,7,c.fruit);
      P(-9,-11,18,4,c.fruit2);
      if(c.stripe){ // watermelon / melon markings
        for(const x of [-8,-3,2,7]) P(x,-9,1,12,c.stripe);
        if(c.id==='melon'){ for(let y=-8;y<2;y+=3) P(-10,y,20,1,c.stripe); }
      } else { // pumpkin ribs
        for(const x of [-7,-1,5]) P(x,-9,2,12,c.dark);
        P(-1,-17,2,4,'#6b4a1f');
      }
      P(-11,-9,22,2,shade(c.fruit,20));
    },
    // strawberry / blueberry — low leafy clump + berries
    berry(ctx, c, P){
      P(-9,-6,18,8,c.leaf);
      P(-10,-4,20,5,c.leaf2);
      P(-6,-9,5,4,c.leaf); P(1,-9,5,4,c.leaf);
      const spots = c.id==='blueberry'
        ? [[-7,-2],[0,0],[6,-3],[-2,2],[4,2]]
        : [[-6,-1],[2,1],[-1,3],[5,-2]];
      for(const [x,y] of spots){
        P(x,y,4,4,c.fruit); P(x,y,4,1,c.fruit2); P(x+1,y+1,1,1,'#fff');
        if(c.id!=='blueberry'){ P(x+1,y-1,1,1,c.leaf2); }
      }
    },
    // grape — trellis + hanging cluster
    vine(ctx, c, P){
      P(-9,-22,2,24,shade('#8a6736',10)); P(7,-22,2,24,shade('#8a6736',10));
      P(-9,-22,18,2,shade('#8a6736',10));
      P(-3,-20,2,6,c.leaf); P(-7,-19,4,3,c.leaf2); P(2,-19,5,3,c.leaf2);
      // cluster (triangle of berries)
      const rows=[[-4,-14,3],[-6,-11,4],[-3,-8,3],[-1,-5,2]];
      for(const [x,y,n] of rows){ for(let i=0;i<n;i++){ P(x+i*3,y,3,3,c.fruit); P(x+i*3,y,3,1,c.fruit2); } }
      P(-1,-15,2,2,c.leaf2);
    },
    // generic fruit tree — trunk + canopy + fruit dots
    tree(ctx, c, P, t){
      P(-2,-9,4,10,'#8a5a2c'); P(-2,-9,2,10,'#6a421c');
      P(-11,-24,22,15,c.leaf);
      P(-13,-20,26,10,c.leaf);
      P(-9,-27,18,7,c.leaf2);
      P(-11,-24,22,4,shade(c.leaf,18));
      // fruit
      let dots = c.id==='cherry'
        ? [[-7,-16],[-4,-13],[3,-17],[6,-14],[-1,-20]]
        : [[-8,-17],[3,-19],[-2,-14],[6,-15],[-6,-12],[1,-22]];
      for(const [x,y] of dots){
        P(x,y,4,4,c.fruit); P(x,y,4,1,c.fruit2); P(x+3,y+1,1,2,c.dark);
        if(c.golden){ P(x+1,y+1,1,1,'#fff'); }
      }
      if(c.golden){ // sparkle
        const gl=Math.sin(t*3)>0;
        P(gl?9:-11, -26, 1, 3, '#fff'); P(gl?8:-12, -25, 3, 1, '#fff');
      }
    },
    // dense bush — low round canopy + berries/leaves (no trunk)
    bush(ctx, c, P){
      P(-11,-16,22,17,c.leaf);
      P(-12,-12,24,12,c.leaf);
      P(-8,-19,17,6,c.leaf2);
      P(-11,-16,22,4,shade(c.leaf,16));
      let dots = c.id==='coffee'
        ? [[-8,-11],[4,-13],[-2,-7],[6,-8],[-6,-4]]
        : [[-8,-10],[3,-12],[-2,-6],[6,-7],[-6,-3],[1,-14]];
      for(const [x,y] of dots){
        if(c.flower){ // tea flowers (white 4-petal)
          P(x,y,4,4,c.leaf2); P(x+1,y-1,2,2,'#fff'); P(x-1,y+1,2,2,'#fff'); P(x+1,y+1,1,1,'#f4d24a');
        } else {
          P(x,y,4,4,c.fruit); P(x,y,4,1,c.fruit2); P(x+2,y+2,1,1,c.dark);
        }
      }
    },
    // cacao — trunk with pods hanging on it
    pod(ctx, c, P){
      P(-2,-9,4,10,'#8a5a2c'); P(-2,-9,2,10,'#6a421c');
      P(-10,-24,20,14,c.leaf); P(-12,-20,24,9,c.leaf); P(-8,-26,16,6,c.leaf2);
      // pods on trunk
      P(-7,-8,4,7,c.fruit); P(-7,-8,4,2,c.fruit2); P(-6,-2,2,2,shade(c.fruit,-25));
      P(4,-9,4,7,c.fruit); P(4,-9,4,2,c.fruit2);
      P(-1,-6,4,7,c.fruit); P(-1,-6,4,2,c.fruit2);
      for(const x of [-7,4,-1]) P(x+1,-8,1,6,shade(c.fruit,-30));
    },
    // banana palm — trunk + drooping fronds + bunch
    palm(ctx, c, P){
      P(-3,-12,6,13,'#7a5230'); P(-3,-12,2,13,'#5a3a1c');
      P(-3,-12,6,2,shade('#7a5230',20));
      // fronds
      P(-16,-16,14,3,c.leaf); P(2,-17,15,3,c.leaf);
      P(-14,-20,11,3,c.leaf2); P(3,-21,12,3,c.leaf2);
      P(-8,-24,16,3,c.leaf); P(-2,-26,4,4,c.leaf2);
      // banana bunch
      P(-6,-12,3,7,c.fruit); P(-6,-5,3,2,shade(c.fruit,-25));
      P(-2,-13,3,8,c.fruit2); P(2,-12,3,7,c.fruit); P(2,-5,3,2,shade(c.fruit,-25));
      P(-6,-13,9,2,c.dark);
    },
  };

  window.LumiaCrops = { TIERS, CROPS, FEED, HUNGER, drawCrop, drawFruit, drawMound, shade };
})();

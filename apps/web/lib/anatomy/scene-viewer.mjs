import * as T from "three";
import { assemblyScenes, clotScenes, cubeScenes, earthScenes, plantScenes, solarScenes } from "./scene-models.mjs";
import { geometryScenes } from "./geometry-scenes.mjs";

const v = (x, y, z) => new T.Vector3(x, y, z);
const svgElement = tag => document.createElementNS("http://www.w3.org/2000/svg", tag);

export function mountVisualScene(root, visual, step, unavailable) {
  const stage = root.querySelector("[data-scene-stage]");
  const leaders = root.querySelector("[data-scene-leaders]");
  const split = root.querySelector("input");
  const splitControl = split.closest("label");
  const splitLabel = splitControl.querySelector("span");
  const turn = root.querySelector("[data-scene-turn]");
  const title = root.querySelector("figcaption strong");
  const text = root.querySelector("figcaption p");
  const crumbs = root.querySelector("[data-scene-location]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const scene = new T.Scene();
  scene.background = new T.Color(0xe9eee0);
  const renderer = new T.WebGLRenderer({ antialias: true });
  const views = visual.kind === "blood_clot" ? clotScenes()
    : visual.kind === "geometry" ? geometryScenes(visual)
    : visual.kind === "cube_net" ? cubeScenes(visual.detail)
    : visual.kind === "solar_system" ? solarScenes(visual)
    : step ? plantScenes(step) : visual.kind === "earth" ? earthScenes(visual.details) : assemblyScenes(visual);
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.domElement.setAttribute("aria-label", "Model tiga dimensi. Seret untuk memutar.");
  stage.prepend(renderer.domElement);
  renderer.domElement.addEventListener("webglcontextlost", unavailable);
  const camera = new T.PerspectiveCamera(39, 1, 0.05, 80);
  scene.add(new T.HemisphereLight(0xfff7d9, 0x68796a, 2.35));
  const sun = new T.DirectionalLight(0xffedcc, 2.2);
  sun.position.set(-4, 7, 5);
  scene.add(sun);
  const fill = new T.DirectionalLight(0xcbded5, .75);
  fill.position.set(4, 3, -5);
  scene.add(fill);

  for(const view of views){view.group.visible=false;scene.add(view.group);}
  let active=0, chosen=null, animation=null, frame=null, drag=null;
  let yaw=0,pitch=0,distance=0,target=v(0,0,0),spread=0;
  let buttons=[];
  const poses=new Map();
  const fitOf = view => stage.clientWidth < 500 ? (view.mobileFit ?? 1.42) : 1;
  let fit = fitOf(views[0]);
  function remember() {
    if(!animation) poses.set(active,{yaw,pitch,distance,target:target.clone(),spread,chosen,fit});
  }
  function navigate(index, enter=false) {
    remember();
    show(index, enter);
  }
  function schedule() {
    if(frame===null) frame=requestAnimationFrame(render);
  }
  function render(now) {
    frame=null;
    if(animation){
      const t=Math.min(1,(now-animation.start)/animation.duration);
      const progress=t*t*(3-2*t);
      distance=T.MathUtils.lerp(animation.fromDistance,animation.toDistance,progress);
      target.lerpVectors(animation.fromTarget,animation.toTarget,progress);
      if(t>=1){const finish=animation.finish;animation=null;finish?.();} else schedule();
    }
    views[active].setSpread?.(spread);
    camera.position.copy(target).add(v(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance));
    camera.lookAt(target);
    renderer.render(scene,camera);
    positionLabels();
  }

  function positionLabels() {
    const width=stage.clientWidth,height=stage.clientHeight;
    const mobile=width<540;
    const margin=mobile?9:24;
    const gap=mobile?44:47;
    const upper=24,lower=height-82;
    leaders.setAttribute("viewBox",`0 0 ${width} ${height}`);
    leaders.style.visibility=animation?"hidden":"visible";
    for(const item of buttons){
      const point=item.pin.at().project(camera);
      item.button.hidden=Boolean(animation)||point.z>1;
      item.group.style.display=item.button.hidden?"none":"";
      item.x=(point.x+1)*width/2;
      item.y=(1-point.y)*height/2;
      item.row=item.y+item.pin.lift;
    }

    for(const side of ["left","right"]){
      const column=buttons.filter(item=>item.pin.side===side&&!item.button.hidden).sort((a,b)=>a.row-b.row);
      let previous=upper-gap;
      column.forEach((item,index)=>{
        const latest=lower-gap*(column.length-index-1);
        item.row=T.MathUtils.clamp(item.row,previous+gap,latest);
        previous=item.row;
        const labelWidth=item.button.offsetWidth;
        const rail=mobile?margin:Math.max(margin,width/2-290);
        const runway=mobile?23:40;
        const left=side==="left"
          ? T.MathUtils.clamp(item.x-labelWidth-runway,rail,width-labelWidth-margin)
          : T.MathUtils.clamp(item.x+runway,margin,width-labelWidth-rail);
        const start=side==="left"?left+labelWidth-4:left+4;
        const end=side==="left"?left+4:left+labelWidth-4;
        const lineY=item.row+11;
        item.button.style.left=left+"px";
        item.button.style.top=item.row+"px";
        item.path.setAttribute("d",`M ${item.x} ${item.y} L ${start} ${lineY} H ${end}`);
        item.dot.setAttribute("cx",item.x);
        item.dot.setAttribute("cy",item.y);
      });
    }
  }
  function show(index, enter=false) {
    animation=null;
    active=index;
    const view=views[index];
    views.forEach((item,i)=>{item.group.visible=i===index});
    const saved=poses.get(index);
    yaw=saved?.yaw??view.angle; pitch=saved?.pitch??view.pitch; target.copy(saved?.target??view.target);
    fit=fitOf(view);
    const fitDistance=saved ? saved.distance*fit/saved.fit : view.distance*fit;
    distance=fitDistance*(enter&&!reduced.matches?.84:1);
    chosen=saved?.chosen??null; spread=saved?.spread??0;
    title.textContent=chosen?.label??view.caption??view.name;
    text.textContent=chosen?.info??view.detail;
    splitControl.hidden=!view.slider;
    splitLabel.textContent=view.slider??"";
    split.value=String(Math.round(spread*100));
    crumbs.replaceChildren();
    const path = [];
    for (let sceneIndex = index; sceneIndex >= 0; sceneIndex = views[sceneIndex].parent ?? sceneIndex - 1) path.unshift(sceneIndex);
    for(const i of path){
      if(i) {const mark=document.createElement("span");mark.textContent="›";mark.setAttribute("aria-hidden","true");crumbs.append(mark);}
      const item=document.createElement(i===index?"strong":"button");
      item.textContent=views[i].name;
      if(i!==index){
        item.type="button";
        item.className="visual-quiet-button";
        item.onclick=()=>{stage.focus({ preventScroll:true });navigate(i);};
      }
      else item.setAttribute("aria-current","location");
      crumbs.append(item);
    }
    buttons.forEach(({button})=>button.remove());
    leaders.replaceChildren();
    buttons=view.pins.map(pin=>{
      const button=document.createElement("button");
      button.type="button";
      button.className="visual-scene-pin";
      const group=svgElement("g");
      const path=svgElement("path");
      const dot=svgElement("circle");
      dot.setAttribute("r","3.7");
      group.classList.add("leader");
      group.classList.toggle("is-selected",pin===chosen);
      group.append(path,dot);
      leaders.append(group);
      button.title=pin.label;
      button.textContent=pin.label+(pin.go!==undefined?" ↗":"");
      if(pin.go!==undefined) button.setAttribute("aria-label","Buka "+pin.label.toLowerCase());
      else button.setAttribute("aria-pressed",String(pin===chosen));
      button.onclick=()=>{
        if(pin.go!==undefined){focusIn(pin);return;}
        chosen=pin;
        title.textContent=pin.label;text.textContent=pin.info;
        buttons.forEach(item=>{
          item.group.classList.toggle("is-selected",item.pin===chosen);
          if(item.pin.go===undefined)item.button.setAttribute("aria-pressed",String(item.pin===chosen));
        });
      };
      stage.append(button);
      return {pin,button,group,path,dot};
    });
    if(enter&&!reduced.matches) animation={start:performance.now(),duration:300,fromDistance:distance,toDistance:fitDistance,fromTarget:target.clone(),toTarget:target.clone()};
    schedule();
  }
  function focusIn(pin) {
    remember();
    stage.focus({ preventScroll:true });
    if(reduced.matches){show(pin.go);return;}
    animation={start:performance.now(),duration:430,fromDistance:distance,toDistance:distance*.55,fromTarget:target.clone(),toTarget:pin.at(),finish:()=>show(pin.go,true)};
    schedule();
  }
  split.oninput=()=>{
    spread=split.valueAsNumber/100;
    schedule();
  };
  turn.onclick=()=>{if(!animation){yaw+=Math.PI/6;schedule();}};
  renderer.domElement.addEventListener("pointerdown",event=>{
    if(animation||!event.isPrimary||event.button!==0)return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,yaw,pitch};
  });
  renderer.domElement.addEventListener("pointermove",event=>{
    if(drag?.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.abs(dx)<5&&!renderer.domElement.hasPointerCapture(event.pointerId))return;
    renderer.domElement.setPointerCapture(event.pointerId);
    yaw=drag.yaw-dx*.011;
    pitch=T.MathUtils.clamp(drag.pitch+dy*.008,-.08,1.05);
    schedule();
  });
  renderer.domElement.addEventListener("pointerup", event => {
    if (drag?.id !== event.pointerId) return;
    const moved = renderer.domElement.hasPointerCapture(event.pointerId) ||
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5;
    drag = null;
    if (moved || animation) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, camera);
    const group = views[active].group;
    let part = raycaster.intersectObject(group, true).find(hit => hit.object.isMesh)?.object;
    while (part && part !== group) {
      if (part.userData.pin !== undefined) {
        buttons[part.userData.pin]?.button.click();
        break;
      }
      part = part.parent;
    }
  });
  renderer.domElement.addEventListener("pointercancel", () => { drag = null; });
  renderer.domElement.addEventListener("pointerleave", event => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) drag = null;
  });
  const resize = new ResizeObserver(()=>{
    const {clientWidth,clientHeight} = stage;
    if (!clientWidth || !clientHeight) return;
    const nextFit = fitOf(views[active]);
    if (nextFit !== fit) {
      const ratio = nextFit / fit;
      distance *= ratio;
      if (animation) {
        animation.fromDistance *= ratio;
        animation.toDistance *= ratio;
      }
      fit = nextFit;
    }
    renderer.setSize(clientWidth,clientHeight,false);
    camera.aspect=clientWidth/clientHeight;
    camera.updateProjectionMatrix();
    schedule();
  });
  resize.observe(stage);
  show(0);

  return () => {
    resize.disconnect();
    if(frame!==null) cancelAnimationFrame(frame);
    split.oninput=null;
    turn.onclick=null;
    crumbs.replaceChildren();
    leaders.replaceChildren();
    buttons.forEach(({button})=>button.remove());
    const resources = new Set();
    scene.traverse(object => {
      if(object.geometry) resources.add(object.geometry);
      if(object.material) resources.add(object.material);
    });
    resources.forEach(resource=>resource.dispose());
    renderer.domElement.removeEventListener("webglcontextlost", unavailable);
    renderer.dispose();
    renderer.domElement.remove();
  };
}

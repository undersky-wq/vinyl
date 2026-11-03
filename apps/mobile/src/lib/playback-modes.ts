export function shuffledQueue<T extends {id:string}>(tracks:T[], activeId:string, random=Math.random):T[] {
  const active=tracks.find(track=>track.id===activeId);
  const rest=tracks.filter(track=>track.id!==activeId);
  for(let i=rest.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
  return active?[active,...rest]:rest;
}

export function playbackRepeatMode(repeat:boolean,shuffle:boolean){
  return repeat?'Track':shuffle?'Queue':'Off';
}

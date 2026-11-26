import { useId } from 'react';
import { ASSETS } from '../assets.js';
import { useMascotSource } from './AnimatedMascot.jsx';

const BOARDS = [
  { deck: '#fff2d8', rail: '#cd514c', stripe: '#e16c61', shade: '#b73c39' },
  { deck: '#38c5bf', rail: '#176d83', stripe: '#e6fff3', shade: '#116c81' },
  { deck: '#ffc568', rail: '#b84c60', stripe: '#ec7954', shade: '#a13c56' },
  { deck: '#393260', rail: '#9380d4', stripe: '#d9c5ff', shade: '#211e47' },
];

function BoardSurface({ board }) {
  const uid = useId().replace(/:/g, '');
  const index = Number.isInteger(board) && board >= 0 && board < BOARDS.length ? board : 0;
  const colors = BOARDS[index];
  const outline = 'M48 977C130 925 362 966 650 1014C931 1061 1130 1097 1190 1151C1170 1219 937 1244 651 1217C340 1188 107 1102 48 997Z';
  return <g data-board-design={index}>
    <defs>
      <linearGradient id={`${uid}-deck`} x1="500" y1="965" x2="570" y2="1230" gradientUnits="userSpaceOnUse"><stop stopColor={colors.deck} /><stop offset="1" stopColor={colors.rail} /></linearGradient>
      <clipPath id={`${uid}-clip`}><path d={outline} /></clipPath>
    </defs>
    <path d={outline} fill={colors.shade} stroke={colors.shade} strokeWidth="9" strokeLinejoin="round" />
    <g clipPath={`url(#${uid}-clip)`}>
      <path d="M40 970C220 929 502 1002 730 1043C978 1089 1115 1107 1205 1151C1070 1200 780 1187 510 1140C267 1097 110 1036 40 970Z" fill={`url(#${uid}-deck)`} />
      {index === 0 && <><path d="M50 979C325 998 824 1131 1195 1150" fill="none" stroke={colors.stripe} strokeWidth="36" /><path d="M58 1003C330 1028 830 1159 1195 1172" fill="none" stroke="#fff8e9" strokeWidth="10" /></>}
      {index === 1 && <><path d="M82 987Q235 947 365 1047T667 1098T964 1142T1215 1144" fill="none" stroke={colors.stripe} strokeWidth="28" /><path d="M80 1015Q230 978 361 1071T667 1124T963 1168T1215 1170" fill="none" stroke="#b3f2e3" strokeWidth="12" /></>}
      {index === 2 && <><ellipse cx="252" cy="1021" rx="100" ry="44" transform="rotate(10 252 1021)" fill="#ffe4a5" /><path d="M70 1012C370 1049 812 1179 1200 1169" fill="none" stroke={colors.stripe} strokeWidth="42" /><path d="M68 1045C374 1081 812 1205 1190 1201" fill="none" stroke="#bb4b66" strokeWidth="22" /></>}
      {index === 3 && <><path d="M65 993C323 985 758 1140 1200 1155" fill="none" stroke="#8370c2" strokeWidth="32" /><path d="M65 993C323 985 758 1140 1200 1155" fill="none" stroke={colors.stripe} strokeWidth="7" />{[[188,1016],[390,1065],[622,1118],[848,1146],[1057,1150]].map(([x,y]) => <path key={x} d={`M${x} ${y-17}L${x+7} ${y-4}L${x+22} ${y}L${x+7} ${y+5}L${x} ${y+18}L${x-6} ${y+5}L${x-20} ${y}L${x-6} ${y-4}Z`} fill="#fff0c9" />)}</>}
      <path d="M47 977C250 1013 764 1181 1194 1151" stroke="#fffaf0" strokeOpacity=".7" strokeWidth="8" fill="none" />
    </g>
  </g>;
}

export function BoardArt({ board = 0 }) {
  return <svg className="surf-board-art" viewBox="0 900 1254 354" aria-hidden="true"><BoardSurface board={board} /></svg>;
}

export default function SurfyRider({ board = 0, className = '', paused = false }) {
  const source = useMascotSource(ASSETS.surfySurfingBody, paused);
  return <svg className={`surfy-rider-art ${className}`} viewBox="0 0 1254 1254" aria-hidden="true" data-equipped-board={board}>
    <BoardSurface board={board} />
    <image className="surfy-body-layer" href={source} width="1254" height="1254" />
  </svg>;
}

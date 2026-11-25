import { expect, it } from 'vitest';
import { buildRecoveryPlan, toggleSituation, recoverySummary } from './plan.js';
import { localGuideAnswer, askGuide } from './chat.js';
import { translate } from '../i18n/useI18n.js';
const t=key=>translate('en',key);
it('prioritizes danger and payment, without suggesting Philippine hotlines abroad',()=>{
 expect(buildRecoveryPlan({situations:['paid','danger'],country:'other'})).toEqual({steps:['safety','payment','stop','evidence','report'],contacts:[]});
 expect(buildRecoveryPlan({situations:['clicked']})).toEqual({steps:['stop'],contacts:[]});
 expect(toggleSituation(['unsure'],'paid')).toEqual(['paid']);
});
it('saves the chosen service and country with the checklist, not chat',()=>{
 const result=recoverySummary({situations:['paid'],provider:'bank',providerName:'UnionBank',country:'other',countryName:'Singapore',completed:[],plan:buildRecoveryPlan({situations:['paid'],country:'other'}),t});
 expect(result).toContain('UnionBank');expect(result).toContain('Singapore');expect(result).not.toContain('2882');
});
it('local guidance responds to the topic without claiming to search',()=>{
 const answer=localGuideAnswer({question:'I sent money',situations:[],t});expect(answer).toContain(t('recovery.step.payment.title'));expect(answer).not.toMatch(/I searched|found online/);
});
it('online guidance includes explicit consent and only a bounded recent conversation',async()=>{
 let payload;
 await askGuide({question:'How do I report?',language:'en',providerName:'BPI',country:'Philippines',situations:['paid'],history:Array.from({length:10},()=>({role:'user',content:'test'}))},undefined,async(path,options)=>{payload=JSON.parse(options.body);expect(path).toBe('/api/recovery-guide');return Response.json({status:'completed',answer:'Use your usual app.'});});
 expect(payload.consent).toBe(true);expect(payload.history).toHaveLength(6);expect(payload.providerName).toBe('BPI');
});

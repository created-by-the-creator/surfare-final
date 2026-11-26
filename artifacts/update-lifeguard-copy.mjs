import fs from 'node:fs/promises';
const copy={
 en:{
  eyebrow:'A little help, right here',title:"Let's take one step.",intro:"You don't have to handle this alone. Let's find your next step.",
  guideTitle:'One thing at a time.',guideIntro:'Focus on the action below.',doneTitle:'Keep your next steps close.',doneIntro:'You can revisit any step or save a copy.',
  'choice.paid':'I sent money','choice.shared':'My account or details may be at risk','choice.unsure':"I'm not sure what happened",other:'Something else happened',
  stepCount:'Step {current} of {total}',progress:'Guide progress',first:'Start here',next:'Your next action',trustedPerson:'If it feels like too much, ask someone you trust to sit with you.',
  findSupport:'Help me find official support',whichProvider:'Which service did you use?',otherProvider:'Another bank or service',foreignSupport:'Open Help or Support in your usual app, or use a number from your card or a website you already trust.',
  reportingHelp:'Show the official reporting channel',doneAction:"I've done this",later:"I'll come back to this",previous:'Previous step',also:'Did something else happen too?',completedCount:'{done} of {total} actions marked done. Unfinished steps are still in your guide.',
  review:'Review my steps',revisit:'Revisit',ask:'I need help with this',region:'Philippines · change',danger:'Immediate danger?',local:'No details needed to start. This guide works offline.',
  'step.payment':"Don't send any more money. Open Help in the app you used to pay. Report the payment and ask if it can be stopped or disputed. Keep the case reference. Recovery isn't guaranteed.",
  'step.account':'Use the official app on a device you trust. Change any exposed password and contact support if you shared a PIN or OTP. Never give Surfare your passwords or codes.',
  'step.device':"Don't open the download. If you installed it, avoid banking on that device for now. Update and run its security scanner, or ask someone you trust for technical help.",
  'step.stop':"Close the page and stop replying. Don't send more money, share codes, or pay someone promising to recover your money.",
  'step.review':'Did you send money, share a password or code, or install an app? If you remember something, use “Did something else happen too?” below to update your guide.',
  'step.evidence':'Keep the messages, screenshots and payment receipts for official support. Store them privately. Never share passwords or OTPs.',
  'step.threat':"Tell someone you trust and preserve the messages. Report the threat through official police or cybercrime channels. If you're in immediate physical danger, get emergency help now.",
  'step.report':"For a payment or account issue, start with your provider's fraud support. Report the sender on the platform too. In the Philippines, CICC accepts cybercrime reports. Keep the reference numbers.",
  'step.safety':'Move somewhere safer if you can. Contact local emergency services and a trusted person now. You do not need to finish this guide first.',
 },
 tl:{
  eyebrow:'Gabay sa susunod mong hakbang',title:'Isang hakbang muna.',intro:'Hindi mo kailangang harapin ito nang mag-isa. Hanapin natin ang susunod mong gagawin.',guideTitle:'Isa-isa lang muna.',guideIntro:'Unahin ang gawaing nasa ibaba.',doneTitle:'Dalhin ang gabay mo.',doneIntro:'Maaari mong balikan ang mga hakbang o mag-save ng kopya.',
  'choice.paid':'Nagpadala ako ng pera','choice.shared':'Maaaring nalantad ang account o detalye ko','choice.unsure':'Hindi ako sigurado sa nangyari',other:'May iba pang nangyari',
  stepCount:'Hakbang {current} sa {total}',progress:'Pag-usad sa gabay',first:'Dito magsimula',next:'Ang susunod mong gagawin',trustedPerson:'Kung mabigat ito para sa iyo, magpasama sa isang pinagkakatiwalaan mo.',
  findSupport:'Tulungan akong hanapin ang opisyal na suporta',whichProvider:'Anong serbisyo ang ginamit mo?',otherProvider:'Ibang bangko o serbisyo',foreignSupport:'Buksan ang Help o Support sa app na dati mong gamit, o gamitin ang numerong nasa card o website na pinagkakatiwalaan mo.',reportingHelp:'Ipakita ang opisyal na paraan ng pag-uulat',
  doneAction:'Nagawa ko na ito',later:'Babalikan ko ito',previous:'Naunang hakbang',also:'May iba pa bang nangyari?',completedCount:'{done} sa {total} gawain ang minarkahang tapos. Nasa gabay pa rin ang mga hindi natapos.',review:'Balikan ang mga hakbang',revisit:'Balikan',ask:'Kailangan ko ng tulong dito',region:'Pilipinas · baguhin',danger:'May agarang panganib?',local:'Walang kailangang detalye para magsimula. Gumagana ang gabay kahit offline.',
  'step.payment':'Huwag nang magpadala ng pera. Buksan ang Help sa app na ginamit sa pagbabayad. Iulat ang bayad at itanong kung maaari itong pigilan o tutulan. Itago ang case reference. Hindi garantisado ang pagbawi.',
  'step.account':'Gamitin ang opisyal na app sa device na pinagkakatiwalaan mo. Palitan ang nalantad na password at kontakin ang suporta kung naibahagi ang PIN o OTP. Huwag ibigay sa Surfare ang password o code mo.',
  'step.device':'Huwag buksan ang download. Kung na-install mo na, huwag munang mag-banking sa device na iyon. I-update at patakbuhin ang security scanner, o humingi ng teknikal na tulong sa pinagkakatiwalaan mo.',
  'step.stop':'Isara ang pahina at huwag nang sumagot. Huwag magpadala ng pera o code, at huwag bayaran ang nangangakong babawi ng pera mo.',
  'step.review':'Nagpadala ka ba ng pera, nagbahagi ng password o code, o nag-install ng app? Kung may naalala ka, buksan ang “May iba pa bang nangyari?” sa ibaba upang baguhin ang gabay.',
  'step.evidence':'Itago ang mga mensahe, screenshot at resibo para sa opisyal na suporta. Panatilihing pribado ang mga ito. Huwag magbahagi ng password o OTP.',
  'step.threat':'Sabihin sa pinagkakatiwalaan mo at itago ang mga mensahe. Iulat ang banta sa opisyal na pulis o cybercrime channel. Kung may agarang pisikal na panganib, humingi agad ng emerhensiyang tulong.',
  'step.report':'Para sa bayad o account, unahin ang fraud support ng provider. I-report din ang nagpadala sa platform. Sa Pilipinas, tumatanggap ang CICC ng ulat ng cybercrime. Itago ang reference number.',
  'step.safety':'Pumunta sa mas ligtas na lugar kung kaya. Kontakin agad ang lokal na emergency services at isang pinagkakatiwalaan mo. Hindi kailangang tapusin muna ang gabay.',
 },
 taglish:{
  eyebrow:'Kaunting tulong, nandito lang',title:'One step muna.',intro:'Hindi mo kailangang harapin ito alone. Hanapin natin ang next step mo.',guideTitle:'Isa-isa lang muna.',guideIntro:'Unahin ang action sa ibaba.',doneTitle:'Keep your guide close.',doneIntro:'Pwede mong balikan ang steps o save a copy.',
  'choice.paid':'Nag-send ako ng pera','choice.shared':'Baka at risk ang account o details ko','choice.unsure':"Hindi ako sure sa nangyari",other:'May iba pang nangyari',
  stepCount:'Step {current} of {total}',progress:'Guide progress',first:'Start here',next:'Your next action',trustedPerson:'Kung overwhelming, ask someone you trust na samahan ka muna.',findSupport:'Help me find official support',whichProvider:'Anong service ang ginamit mo?',otherProvider:'Ibang bank o service',foreignSupport:'Open Help or Support sa usual app mo, o gamitin ang number sa card o trusted website.',reportingHelp:'Show official reporting help',
  doneAction:'Nagawa ko na ito',later:'Babalikan ko ito',previous:'Previous step',also:'May iba pa bang nangyari?',completedCount:'{done} of {total} actions marked done. Nasa guide pa rin ang unfinished steps.',review:'Review my steps',revisit:'Balikan',ask:'Need ko ng help dito',region:'Philippines · change',danger:'May immediate danger?',local:'No details needed para magsimula. Works offline ang guide.',
  'step.payment':"Huwag nang mag-send ng pera. Open Help sa app na ginamit mo to pay. Report the payment at ask kung pwede itong ma-stop o ma-dispute. Keep the case reference. Hindi guaranteed ang recovery.",
  'step.account':'Use the official app sa trusted device. Change any exposed password at contact support kung na-share mo ang PIN o OTP. Huwag ibigay sa Surfare ang passwords o codes mo.',
  'step.device':"Huwag buksan ang download. Kung installed na, avoid banking muna sa device na iyon. Update and run its security scanner, o ask a trusted person for technical help.",
  'step.stop':'Close the page at stop replying. Huwag mag-send ng more money o codes, at huwag magbayad sa nangangakong mare-recover ang pera mo.',
  'step.review':'Nag-send ka ba ng money, nag-share ng password o code, o nag-install ng app? Kung may naalala ka, use “May iba pa bang nangyari?” below to update your guide.',
  'step.evidence':'Keep the messages, screenshots at payment receipts for official support. Store them privately. Huwag mag-share ng passwords o OTPs.',
  'step.threat':"Tell someone you trust at keep the messages. Report the threat sa official police or cybercrime channels. Kung may immediate physical danger, get emergency help now.",
  'step.report':'For payments or accounts, start sa fraud support ng provider. Report the sender sa platform too. Sa Philippines, CICC accepts cybercrime reports. Keep the reference numbers.',
  'step.safety':'Pumunta sa safer place kung kaya. Contact local emergency services at someone you trust ngayon. No need tapusin muna ang guide.',
 }
};
for(const [lang,entries] of Object.entries(copy)){
 const file=`frontend/src/i18n/${lang}.json`;
 const dictionary=JSON.parse(await fs.readFile(file,'utf8'));
 for(const [key,value] of Object.entries(entries))dictionary['recovery.simple.'+key]=value;
 const chatCopy={
  en:{greeting:'Tell me which step you need help with. No passwords or codes needed.',clarify:"Go back to the guide and choose what happened. I'll show you one action to start with.",localContact:'Open Help or Support in the app you normally use. For a bank card, use the number printed on the card. The guide also has a “Help me find official support” option.'},
  tl:{greeting:'Sabihin kung aling hakbang ang kailangan mong linawin. Walang kailangang password o code.',clarify:'Bumalik sa gabay at piliin kung ano ang nangyari. Ipapakita ko ang isang hakbang na maaari mong unahin.',localContact:'Buksan ang Help o Support sa dati mong app. Para sa bank card, gamitin ang numerong nasa card. May opsyon din sa gabay para hanapin ang opisyal na suporta.'},
  taglish:{greeting:'Tell me kung aling step ang need mo ng help. No passwords or codes needed.',clarify:'Balik sa guide at choose kung ano ang nangyari. Ipapakita ko ang one action na pwede mong unahin.',localContact:'Open Help or Support sa usual app mo. For a bank card, use the number sa card. May “Help me find official support” option din sa guide.'},
 };
 for(const [key,value] of Object.entries(chatCopy[lang]))dictionary['recovery.chat.'+key]=value;
 await fs.writeFile(file,JSON.stringify(dictionary,null,2)+'\n');
}

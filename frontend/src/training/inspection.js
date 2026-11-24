// Authored teaching cues, separate from detector training and evaluation data.
export const PRACTICE_CLUES = {
  wallet: [
    { en: 'Reply with the OTP', tl: 'I-reply ang OTP', taglish: 'Reply with your OTP' },
    { en: 'logo and staff ID', tl: 'logo at staff ID', taglish: 'logo at staff ID' },
  ],
  winnings: [
    { en: 'I will make you win 8,000', tl: 'ipapanalo kita ng 8,000', taglish: 'ipapanalo kita 8,000' },
    { en: 'The slot closes soon', tl: 'Magsasara na ang slot', taglish: 'Last slot na' },
  ],
  delivery: [
    { en: 'parcel-fix.example', tl: 'parcel-fix.example', taglish: 'parcel-fix.example' },
    { en: 'Your original order page', tl: 'orihinal na order page', taglish: 'original order page' },
  ],
  job: [
    { en: 'Deposit 800 pesos', tl: 'Magdeposito ng 800 piso', taglish: 'Deposit 800' },
    { en: 'If you quit now, you lose everything', tl: 'Kapag tumigil ka, mawawala ang lahat', taglish: 'Quit now and lose everything' },
  ],
  reminder: [
    { en: 'Never share your OTP or password', tl: 'Huwag ibahagi ang OTP o password', taglish: 'Never share your OTP or password' },
    { en: 'reply with your current OTP', tl: 'i-reply ang kasalukuyang OTP', taglish: 'reply with your current OTP' },
  ],
  family: [
    { en: 'This is my new number', tl: 'Ito ang bago kong numero', taglish: 'New number ko ito' },
    { en: 'Do not tell anyone else', tl: 'Huwag sabihin sa iba', taglish: 'Huwag sabihin sa iba' },
  ],
};

export function splitPracticeMessage(message, clue) {
  const start = clue ? message.indexOf(clue) : -1;
  if (start < 0) return [{ text: message }];
  return [
    { text: message.slice(0, start) },
    { text: clue, inspectable: true },
    { text: message.slice(start + clue.length) },
  ].filter((part) => part.text);
}

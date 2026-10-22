import { describe, it, expect } from 'vitest';
import { detectLanguage, languageCorrection } from '@/pages/reader/lib/detect-language';

const FR =
  "Aujourd'hui, nous allons au marché avec les enfants. Il y a des fruits, des légumes et du pain frais pour toute la famille. " +
  "Elle dit que le temps est très beau et qu'ils ont envie de se promener dans le parc avant de rentrer à la maison. " +
  'Les jeux sont dans la cour et nous sommes tous contents de la journée.';
const EN =
  'Today we are going to the market with the children. There are fruits, vegetables and fresh bread for the whole family. ' +
  'She says that the weather is very nice and that they want to walk in the park before they go back to the house. ' +
  'The games are in the yard and we are all happy with the day.';
const ES =
  'Hoy vamos al mercado con los niños. Hay frutas, verduras y pan fresco para toda la familia. ' +
  'Ella dice que el tiempo es muy bueno y que quieren pasear por el parque antes de volver a la casa. Los juegos están en el patio y todos estamos contentos con el día.';
const DE =
  'Heute gehen wir mit den Kindern auf den Markt. Es gibt Obst, Gemüse und frisches Brot für die ganze Familie. ' +
  'Sie sagt, dass das Wetter sehr schön ist und dass sie vor dem Nachhausegehen im Park spazieren wollen. Die Spiele sind im Hof und wir sind alle mit dem Tag zufrieden.';

describe('detectLanguage', () => {
  it('tells the Latin-script languages apart by their function words', () => {
    expect(detectLanguage(FR)).toEqual({ code: 'fr', confident: true });
    expect(detectLanguage(EN)).toEqual({ code: 'en', confident: true });
    expect(detectLanguage(ES)).toEqual({ code: 'es', confident: true });
    expect(detectLanguage(DE)).toEqual({ code: 'de', confident: true });
  });

  it('maps scripts to codes: Han, kana, Devanagari, Cyrillic, Arabic vs Persian', () => {
    expect(detectLanguage('我们今天和孩子们一起去市场。那里有水果、蔬菜和新鲜的面包，全家人都喜欢。天气很好，他们想在回家之前去公园散步。').code).toBe('zh');
    expect(detectLanguage('今日は子どもたちと市場に行きます。果物や野菜、焼きたてのパンがあります。天気がとても良いので、公園を散歩したいです。').code).toBe('ja');
    expect(detectLanguage('आज हम बच्चों के साथ बाज़ार जा रहे हैं। वहाँ फल, सब्ज़ियाँ और ताज़ी रोटी है। मौसम बहुत अच्छा है और वे घर लौटने से पहले पार्क में घूमना चाहते हैं।').code).toBe('hi');
    const ru = 'Сегодня мы идем на рынок с детьми. Там есть фрукты, овощи и свежий хлеб для всей семьи. Она говорит, что погода очень хорошая и что они хотят погулять в парке перед тем, как вернуться домой. Игры во дворе, и мы все довольны этим днем.';
    expect(detectLanguage(ru)).toEqual({ code: 'ru', confident: true });
    expect(detectLanguage('امروز با بچه‌ها به بازار می‌رویم. آنجا میوه، سبزی و نان تازه برای همهٔ خانواده هست. هوا خیلی خوب است و می‌خواهند پیش از برگشتن به خانه در پارک قدم بزنند.').code).toBe('fa');
    expect(detectLanguage('اليوم نذهب إلى السوق مع الأطفال. هناك فواكه وخضروات وخبز طازج لكل العائلة. الطقس جميل جدا ويريدون المشي في الحديقة قبل العودة إلى المنزل.').code).toBe('ar');
  });

  it('refuses to guess on too little text or on a mixed one', () => {
    expect(detectLanguage('Bonjour tout le monde').confident).toBe(false);
    expect(detectLanguage('').confident).toBe(false);
    expect(detectLanguage('1234 5678 9012 3456 7890').confident).toBe(false);
    expect(detectLanguage(`${FR} ${EN}`).confident).toBe(false);
  });
});

describe('languageCorrection (the one-time rule)', () => {
  const fr = { code: 'fr', confident: true };
  it('switches a defaulted language to a confident, different detection', () => {
    expect(languageCorrection({ stored: 'en', defaultLanguage: 'en', detected: fr, alreadyChecked: false })).toBe('fr');
    expect(languageCorrection({ stored: 'es', defaultLanguage: 'es', detected: fr, alreadyChecked: false })).toBe('fr');
  });
  it('leaves everything else alone', () => {
    // checked before: a reader who changed it back is never overruled
    expect(languageCorrection({ stored: 'en', defaultLanguage: 'en', detected: fr, alreadyChecked: true })).toBeNull();
    // same language, unsure, or unknown
    expect(languageCorrection({ stored: 'fr', defaultLanguage: 'en', detected: fr, alreadyChecked: false })).toBeNull();
    expect(languageCorrection({ stored: 'en', defaultLanguage: 'en', detected: { code: 'fr', confident: false }, alreadyChecked: false })).toBeNull();
    expect(languageCorrection({ stored: 'en', defaultLanguage: 'en', detected: { code: '', confident: false }, alreadyChecked: false })).toBeNull();
    // a language the reader chose on purpose (neither the default nor English) is theirs
    expect(languageCorrection({ stored: 'de', defaultLanguage: 'en', detected: fr, alreadyChecked: false })).toBeNull();
  });
});

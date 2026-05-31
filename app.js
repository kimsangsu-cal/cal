/* ==========================================================================
   CalCal (칼칼) - Core Application Logic
   Pure ES Module, Zero Heavy Dependencies, Native Browser Integration
   ========================================================================== */

// 1. Configuration & Supabase Integrator
const SUPABASE_URL = 'https://nlylbnsagdrcigbdrbmw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mff3E21W-zOBJnPMcFEdLw_M0VskTSF';

// Headers for REST API communication
const supabaseHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// Application Global State
const state = {
  currentUser: null,           // '학습자 1' or '학습자 2'
  currentGrade: 6,             // default Grade
  currentSemester: 2,          // default Semester
  currentMonth: 9,             // default Month
  
  // Quiz Specific State
  currentQuestion: null,       // Current question object: { text, answer, area, difficulty }
  quizActive: false,
  timerInterval: null,
  timeStarted: 0,
  timeSpentMs: 0,
  questionIndex: 0,
  
  // Cache for user proficiency & history
  proficiencyCache: {},
  historyCache: []
};

// 2. Math Answer Equivalence Parser
/**
 * Normalizes and parses standard numbers, decimals, and simple fractions into a floating point number.
 */
function parseToNumber(val) {
  if (val === undefined || val === null) return null;
  // Clean all whitespace, lowercase, and remove outer brackets
  let clean = String(val).trim().replace(/\s+/g, '').replace(/\[|\]/g, '');
  
  // If it's a fraction (e.g., 2/10)
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (!isNaN(num) && !isNaN(den) && den !== 0) {
        return num / den;
      }
    }
  }
  
  // Parse standard integer or decimal float
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Checks if the user answer is mathematically equivalent to the correct answer.
 */
function isAnswerCorrect(userAns, correctAns) {
  const uNum = parseToNumber(userAns);
  const cNum = parseToNumber(correctAns);
  if (uNum === null || cNum === null) return false;
  
  // Compare values within a small epsilon to avoid float rounding errors
  return Math.abs(uNum - cNum) < 1e-9;
}

// 3. Korean Elementary Math Curriculum & Question Generator
// maps Grade, Semester, Month -> { areas, generate(area, difficulty) }
const curriculumMap = {
  // --- GRADE 1 ---
  "1-1-3": {
    desc: "9 이하의 수 가르기/모으기",
    areas: ["수 가르기", "수 모으기"],
    generate: (area, diff) => {
      let num1, num2, target;
      if (area === "수 가르기") {
        target = diff === "하" ? 5 : (diff === "중" ? 7 : 9);
        num1 = Math.floor(Math.random() * (target - 1)) + 1;
        num2 = target - num1;
        return {
          text: `${target}는 ${num1}과 [ ] (으)로 가를 수 있습니다.`,
          answer: String(num2)
        };
      } else {
        num1 = diff === "하" ? 2 : (diff === "중" ? 3 : 4);
        num2 = diff === "하" ? 3 : (diff === "중" * 1.5 ? 4 : 5);
        target = num1 + num2;
        return {
          text: `${num1}와 ${num2}를 모으면 [ ]가 됩니다.`,
          answer: String(target)
        };
      }
    }
  },
  "1-1-4": {
    desc: "9 이하의 덧셈",
    areas: ["기본 덧셈", "세 수의 덧셈"],
    generate: (area, diff) => {
      let a, b, c;
      if (diff === "하" || area === "기본 덧셈") {
        a = Math.floor(Math.random() * 5) + 1;
        b = Math.floor(Math.random() * (9 - a)) + 1;
        return { text: `${a} + ${b} = ?`, answer: String(a + b) };
      } else if (diff === "중") {
        a = Math.floor(Math.random() * 4) + 1;
        b = Math.floor(Math.random() * 3) + 1;
        return { text: `${a} + [ ] = ${a + b}`, answer: String(b) };
      } else { // 상
        a = Math.floor(Math.random() * 3) + 1;
        b = Math.floor(Math.random() * 3) + 1;
        c = Math.floor(Math.random() * (9 - a - b)) + 1;
        return { text: `${a} + ${b} + ${c} = ?`, answer: String(a + b + c) };
      }
    }
  },
  "1-1-5": {
    desc: "9 이하의 뺄셈",
    areas: ["기본 뺄셈", "덧셈과 뺄셈의 혼합"],
    generate: (area, diff) => {
      let a, b, c;
      if (diff === "하") {
        a = Math.floor(Math.random() * 6) + 4; // 4~9
        b = Math.floor(Math.random() * (a - 1)) + 1;
        return { text: `${a} - ${b} = ?`, answer: String(a - b) };
      } else if (diff === "중") {
        a = Math.floor(Math.random() * 5) + 4;
        b = Math.floor(Math.random() * (a - 2)) + 1;
        return { text: `${a} - [ ] = ${a - b}`, answer: String(b) };
      } else { // 상
        a = Math.floor(Math.random() * 4) + 5; // 5~8
        b = Math.floor(Math.random() * 3) + 1;
        c = Math.floor(Math.random() * (a - b - 1)) + 1;
        return { text: `${a} - ${b} - ${c} = ?`, answer: String(a - b - c) };
      }
    }
  },
  "1-1-6": {
    desc: "50 이하의 수와 크기 비교",
    areas: ["수의 자릿값", "크기 비교"],
    generate: (area, diff) => {
      let a, b;
      if (diff === "하") {
        a = Math.floor(Math.random() * 3) + 2; // 2~4 tens
        b = Math.floor(Math.random() * 9) + 1;
        return { text: `십 개씩 묶음 ${a}개와 낱개 ${b}개는 몇 일까요?`, answer: String(a * 10 + b) };
      } else if (diff === "중") {
        a = Math.floor(Math.random() * 20) + 15; // 15~35
        b = Math.floor(Math.random() * 20) + 15;
        while (a === b) { b = Math.floor(Math.random() * 20) + 15; }
        return { text: `${a}와 ${b} 중 더 큰 수는 무엇일까요?`, answer: String(Math.max(a, b)) };
      } else { // 상
        a = Math.floor(Math.random() * 3) + 2; // 20~40
        return { text: `${a * 10}보다 3 작은 수는 무엇일까요?`, answer: String(a * 10 - 3) };
      }
    }
  },
  "1-1-7": {
    desc: "덧셈과 뺄셈 종합",
    areas: ["종합 연산"],
    generate: (area, diff) => {
      // mix of simple add/sub
      const isAdd = Math.random() > 0.5;
      if (isAdd) return curriculumMap["1-1-4"].generate("기본 덧셈", diff);
      else return curriculumMap["1-1-5"].generate("기본 뺄셈", diff);
    }
  },
  "1-2-9": {
    desc: "100 이하의 수",
    areas: ["자릿값 계산", "크기 비교"],
    generate: (area, diff) => {
      let a, b;
      if (diff === "하") {
        a = Math.floor(Math.random() * 4) + 5; // 50~80
        b = Math.floor(Math.random() * 9) + 1;
        return { text: `10개씩 묶음 ${a}개와 낱개 ${b}개는 무엇일까요?`, answer: String(a * 10 + b) };
      } else if (diff === "중") {
        a = Math.floor(Math.random() * 30) + 60; // 60~90
        return { text: `${a}보다 10 큰 수는 무엇일까요?`, answer: String(a + 10) };
      } else {
        a = Math.floor(Math.random() * 20) + 70; // 70~90
        b = Math.floor(Math.random() * 20) + 70;
        while (a === b) { b = Math.floor(Math.random() * 20) + 70; }
        return { text: `${a}와 ${b} 중 더 작은 수는 무엇일까요?`, answer: String(Math.min(a, b)) };
      }
    }
  },
  "1-2-10": {
    desc: "십 단위의 덧셈과 뺄셈",
    areas: ["십 단위 덧셈", "십 단위 뺄셈"],
    generate: (area, diff) => {
      let a, b;
      if (area === "십 단위 덧셈") {
        a = (Math.floor(Math.random() * 4) + 1) * 10; // 10~40
        b = (Math.floor(Math.random() * 4) + 1) * 10;
        return { text: `${a} + ${b} = ?`, answer: String(a + b) };
      } else {
        a = (Math.floor(Math.random() * 4) + 5) * 10; // 50~80
        b = (Math.floor(Math.random() * 4) + 1) * 10;
        return { text: `${a} - ${b} = ?`, answer: String(a - b) };
      }
    }
  },
  "1-2-11": {
    desc: "받아올림/내림 없는 계산",
    areas: ["두 자리수 덧셈", "두 자리수 뺄셈"],
    generate: (area, diff) => {
      let a, b;
      if (area === "두 자리수 덧셈") {
        a = Math.floor(Math.random() * 20) + 21; // 21~40
        b = Math.floor(Math.random() * 5) + 1;  // 1~5
        return { text: `${a} + ${b} = ?`, answer: String(a + b) };
      } else {
        a = Math.floor(Math.random() * 20) + 45; // 45~65
        b = Math.floor(Math.random() * 5) + 1;
        return { text: `${a} - ${b} = ?`, answer: String(a - b) };
      }
    }
  },
  "1-2-12": {
    desc: "10을 활용한 계산",
    areas: ["10 모으기", "10 가르기"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 8) + 1; // 1~8
      if (area === "10 모으기") {
        return { text: `${a}와 몇이 있어야 10이 될까요?`, answer: String(10 - a) };
      } else {
        return { text: `10은 ${a}와 [ ] (으)로 가를 수 있습니다.`, answer: String(10 - a) };
      }
    }
  },

  // --- GRADE 2 ---
  "2-1-3": {
    desc: "세 자리 수",
    areas: ["세 자리 자릿값", "크기 비교"],
    generate: (area, diff) => {
      let h = Math.floor(Math.random() * 7) + 2; // 2~8 hundreds
      let t = Math.floor(Math.random() * 8) + 1;
      let o = Math.floor(Math.random() * 9);
      if (diff === "하") {
        return { text: `백 묶음 ${h}개, 십 묶음 ${t}개, 낱개 ${o}개인 수는 무엇일까요?`, answer: String(h * 100 + t * 10 + o) };
      } else if (diff === "중") {
        let val = h * 100 + t * 10 + o;
        return { text: `${val}보다 100 큰 수는 무엇일까요?`, answer: String(val + 100) };
      } else {
        let val = h * 100 + t * 10;
        return { text: `${val}에서 십의 자리 숫자는 무엇일까요?`, answer: String(t) };
      }
    }
  },
  "2-1-4": {
    desc: "받아올림이 있는 덧셈",
    areas: ["받아올림 덧셈"],
    generate: (area, diff) => {
      let a, b;
      if (diff === "하") {
        a = Math.floor(Math.random() * 20) + 15; // 15~35
        b = Math.floor(Math.random() * 8) + 5;   // 5~12 (1 regrouping)
      } else if (diff === "중") {
        a = Math.floor(Math.random() * 30) + 25; // 25~55
        b = Math.floor(Math.random() * 25) + 15; // 15~39 (1-2 regroupings)
      } else {
        a = Math.floor(Math.random() * 40) + 45;
        b = Math.floor(Math.random() * 40) + 35;
      }
      return { text: `${a} + ${b} = ?`, answer: String(a + b) };
    }
  },
  "2-1-5": {
    desc: "받아내림이 있는 뺄셈",
    areas: ["받아내림 뺄셈"],
    generate: (area, diff) => {
      let a, b;
      if (diff === "하") {
        a = Math.floor(Math.random() * 20) + 21; // 21~40
        b = Math.floor(Math.random() * 8) + 5;   // 5~12 (ones place regroups)
        while (a % 10 >= b % 10) { b = Math.floor(Math.random() * 8) + 5; }
      } else if (diff === "중") {
        a = Math.floor(Math.random() * 40) + 41; // 41~80
        b = Math.floor(Math.random() * 25) + 15; // 15~39
        while (a % 10 >= b % 10) { b = Math.floor(Math.random() * 25) + 15; }
      } else {
        a = Math.floor(Math.random() * 40) + 55; // 55~95
        b = Math.floor(Math.random() * 40) + 15;
        while (a % 10 >= b % 10) { b = Math.floor(Math.random() * 40) + 15; }
      }
      return { text: `${a} - ${b} = ?`, answer: String(a - b) };
    }
  },
  "2-1-6": {
    desc: "여러 가지 덧셈과 뺄셈",
    areas: ["세 수의 혼합 계산"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 30) + 20;
      let b = Math.floor(Math.random() * 15) + 10;
      let c = Math.floor(Math.random() * 10) + 5;
      if (diff === "하") {
        return { text: `${a} + ${b} - ${c} = ?`, answer: String(a + b - c) };
      } else if (diff === "중") {
        return { text: `${a} - ${b} + ${c} = ?`, answer: String(a - b + c) };
      } else {
        let ans = a + b - c;
        return { text: `${a} + [ ] - ${c} = ${ans}`, answer: String(b) };
      }
    }
  },
  "2-1-7": {
    desc: "곱셈의 기초",
    areas: ["묶어 세기", "배의 계산"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 5) + 2; // 2~6
      let b = Math.floor(Math.random() * 4) + 2; // 2~5
      if (area === "묶어 세기") {
        return { text: `${a}씩 ${b} 묶음은 모두 몇 일까요?`, answer: String(a * b) };
      } else {
        return { text: `${a}의 ${b}배는 무엇일까요?`, answer: String(a * b) };
      }
    }
  },
  "2-2-9": {
    desc: "네 자리 수",
    areas: ["네 자리 자릿값", "자릿값 비교"],
    generate: (area, diff) => {
      let th = Math.floor(Math.random() * 8) + 1; // 1~8 thousands
      let h = Math.floor(Math.random() * 9);
      let t = Math.floor(Math.random() * 9);
      let o = Math.floor(Math.random() * 9);
      let val = th * 1000 + h * 100 + t * 10 + o;
      if (diff === "하") {
        return { text: `천 묶음 ${th}개, 백 묶음 ${h}개, 십 묶음 ${t}개, 낱개 ${o}개인 수는?`, answer: String(val) };
      } else if (diff === "중") {
        return { text: `${val}에서 백의 자리 숫자는 무엇일까요?`, answer: String(h) };
      } else {
        return { text: `${val}보다 1000 큰 수는 무엇일까요?`, answer: String(val + 1000) };
      }
    }
  },
  "2-2-10": {
    desc: "구구단 (2,5,3,6단)",
    areas: ["곱셈 구구"],
    generate: (area, diff) => {
      const dan = [2, 5, 3, 6][Math.floor(Math.random() * 4)];
      const num = Math.floor(Math.random() * 8) + 2; // 2~9
      if (diff === "하") {
        return { text: `${dan} x ${num} = ?`, answer: String(dan * num) };
      } else if (diff === "중") {
        return { text: `${dan} x [ ] = ${dan * num}`, answer: String(num) };
      } else {
        return { text: `${dan} x ${num} + 5 = ?`, answer: String(dan * num + 5) };
      }
    }
  },
  "2-2-11": {
    desc: "구구단 (4,7,8,9단)",
    areas: ["곱셈 구구"],
    generate: (area, diff) => {
      const dan = [4, 7, 8, 9][Math.floor(Math.random() * 4)];
      const num = Math.floor(Math.random() * 8) + 2; // 2~9
      if (diff === "하") {
        return { text: `${dan} x ${num} = ?`, answer: String(dan * num) };
      } else if (diff === "중") {
        return { text: `${dan} x [ ] = ${dan * num}`, answer: String(num) };
      } else {
        return { text: `${dan} x ${num} - 10 = ?`, answer: String(dan * num - 10) };
      }
    }
  },
  "2-2-12": {
    desc: "시간과 시각 계산",
    areas: ["시간의 합", "시간의 차"],
    generate: (area, diff) => {
      let h1 = Math.floor(Math.random() * 4) + 1;
      let m1 = Math.floor(Math.random() * 4) * 10 + 10; // 10, 20, 30, 40 min
      if (area === "시간의 합") {
        let h2 = Math.floor(Math.random() * 3) + 1;
        let m2 = 20;
        let totalMin = (h1 + h2) * 60 + m1 + m2;
        return { text: `${h1}시간 ${m1}분 + ${h2}시간 ${m2}분 = [ ]분 (분 단위로 모두 변환하여 답을 적으세요)`, answer: String(totalMin) };
      } else {
        return { text: `1시간 ${m1}분은 총 몇 분일까요?`, answer: String(60 + m1) };
      }
    }
  },

  // --- GRADE 3 ---
  "3-1-3": {
    desc: "세 자리 수의 덧셈",
    areas: ["세 자리 수 덧셈"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 400) + 100;
      let b = Math.floor(Math.random() * 400) + 100;
      return { text: `${a} + ${b} = ?`, answer: String(a + b) };
    }
  },
  "3-1-4": {
    desc: "세 자리 수의 뺄셈",
    areas: ["세 자리 수 뺄셈"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 500) + 400; // 400~900
      let b = Math.floor(Math.random() * 300) + 100; // 100~400
      return { text: `${a} - ${b} = ?`, answer: String(a - b) };
    }
  },
  "3-1-5": {
    desc: "곱셈 (두 자리 x 한 자리)",
    areas: ["올림이 있는 곱셈"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 40) + 11; // 11~50
      let b = Math.floor(Math.random() * 7) + 2;   // 2~8
      return { text: `${a} x ${b} = ?`, answer: String(a * b) };
    }
  },
  "3-1-6": {
    desc: "나눗셈의 기초",
    areas: ["기본 나눗셈"],
    generate: (area, diff) => {
      let b = Math.floor(Math.random() * 8) + 2; // 2~9
      let q = Math.floor(Math.random() * 7) + 3; // 3~9
      let a = b * q;
      if (diff === "하") {
        return { text: `${a} ÷ ${b} = ?`, answer: String(q) };
      } else {
        return { text: `${a} ÷ [ ] = ${q}`, answer: String(b) };
      }
    }
  },
  "3-1-7": {
    desc: "길이와 시간 계산",
    areas: ["시간의 계산", "길이의 계산"],
    generate: (area, diff) => {
      let cm = Math.floor(Math.random() * 80) + 10;
      if (area === "길이의 계산") {
        return { text: `3m ${cm}cm는 총 몇 cm일까요?`, answer: String(300 + cm) };
      } else {
        return { text: `1시간 ${cm}분은 총 몇 분일까요?`, answer: String(60 + cm) };
      }
    }
  },
  "3-2-9": {
    desc: "곱셈 (두 자리 x 두 자리)",
    areas: ["두 자리 곱셈"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 20) + 12; // 12~32
      let b = Math.floor(Math.random() * 15) + 11; // 11~26
      return { text: `${a} x ${b} = ?`, answer: String(a * b) };
    }
  },
  "3-2-10": {
    desc: "나눗셈 (몫과 나머지)",
    areas: ["나눗셈 연산"],
    generate: (area, diff) => {
      let b = Math.floor(Math.random() * 6) + 3; // 3~8
      let q = Math.floor(Math.random() * 8) + 2; // 2~9
      let r = Math.floor(Math.random() * (b - 1)) + 1; // remainder
      let a = b * q + r;
      if (diff === "하") {
        return { text: `${a} ÷ ${b} 의 몫은 무엇일까요?`, answer: String(q) };
      } else {
        return { text: `${a} ÷ ${b} 의 나머지는 무엇일까요?`, answer: String(r) };
      }
    }
  },
  "3-2-11": {
    desc: "분수의 기초",
    areas: ["분수 표현"],
    generate: (area, diff) => {
      const den = [4, 5, 8, 10][Math.floor(Math.random() * 4)];
      const num = Math.floor(Math.random() * (den - 1)) + 1;
      return { text: `전체를 똑같이 ${den}개로 나눈 것 중 ${num}개는 몇 분의 몇(A/B)일까요?`, answer: `${num}/${den}` };
    }
  },
  "3-2-12": {
    desc: "소수의 기초",
    areas: ["소수와 분수 변환"],
    generate: (area, diff) => {
      const num = Math.floor(Math.random() * 9) + 1;
      if (Math.random() > 0.5) {
        return { text: `분수 ${num}/10을 소수로 적으세요.`, answer: String(num / 10) };
      } else {
        return { text: `소수 ${num / 10}을 분수(A/B)로 적으세요.`, answer: `${num}/10` };
      }
    }
  },

  // --- GRADE 4 ---
  "4-1-3": {
    desc: "큰 수의 계산",
    areas: ["만 단위 계산"],
    generate: (area, diff) => {
      let a = (Math.floor(Math.random() * 8) + 2) * 10000;
      let b = (Math.floor(Math.random() * 5) + 1) * 10000;
      return { text: `${a} + ${b} = ?`, answer: String(a + b) };
    }
  },
  "4-1-4": {
    desc: "각도 계산",
    areas: ["각도의 합과 차"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 60) + 30; // 30~90
      let b = Math.floor(Math.random() * 40) + 20; // 20~60
      if (Math.random() > 0.5) {
        return { text: `${a}도 + ${b}도 = [ ]도`, answer: String(a + b) };
      } else {
        return { text: `${a + b}도 - ${a}도 = [ ]도`, answer: String(b) };
      }
    }
  },
  "4-1-5": {
    desc: "곱셈 (세 자리 x 두 자리)",
    areas: ["세 자리 곱셈"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 200) + 100;
      let b = Math.floor(Math.random() * 15) + 11;
      return { text: `${a} x ${b} = ?`, answer: String(a * b) };
    }
  },
  "4-1-6": {
    desc: "나눗셈 (세 자리 ÷ 두 자리)",
    areas: ["세 자리 나눗셈"],
    generate: (area, diff) => {
      let b = Math.floor(Math.random() * 15) + 11; // 11~25
      let q = Math.floor(Math.random() * 12) + 5;  // 5~16
      let a = b * q;
      return { text: `${a} ÷ ${b} = ?`, answer: String(q) };
    }
  },
  "4-1-7": {
    desc: "혼합 계산",
    areas: ["사칙연산 혼합"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 10) + 5;
      let b = Math.floor(Math.random() * 5) + 2;
      let c = Math.floor(Math.random() * 8) + 3;
      if (diff === "하") {
        return { text: `${a} + ${b} x ${c} = ?`, answer: String(a + b * c) };
      } else {
        return { text: `(${a} - ${b}) x ${c} = ?`, answer: String((a - b) * c) };
      }
    }
  },
  "4-2-9": {
    desc: "도형의 각도 계산",
    areas: ["삼각형/사각형 각도"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 40) + 40; // 40~80
      let b = Math.floor(Math.random() * 30) + 40; // 40~70
      let sum = a + b;
      return { text: `삼각형 두 각의 크기가 ${a}도, ${b}도 일 때, 나머지 한 각은 몇 도일까요?`, answer: String(180 - sum) };
    }
  },
  "4-2-10": {
    desc: "분수의 덧셈과 뺄셈",
    areas: ["동분모 분수 덧셈", "동분모 분수 뺄셈"],
    generate: (area, diff) => {
      let den = Math.floor(Math.random() * 5) + 6; // 6~10
      let a = Math.floor(Math.random() * 3) + 1;
      let b = Math.floor(Math.random() * 2) + 1;
      if (area === "동분모 분수 덧셈") {
        return { text: `${a}/${den} + ${b}/${den} = ? (답을 A/B 형태로 적으세요)`, answer: `${a + b}/${den}` };
      } else {
        return { text: `${a + b}/${den} - ${a}/${den} = ? (답을 A/B 형태로 적으세요)`, answer: `${b}/${den}` };
      }
    }
  },
  "4-2-11": {
    desc: "소수의 덧셈과 뺄셈",
    areas: ["소수 덧셈", "소수 뺄셈"],
    generate: (area, diff) => {
      let a = (Math.floor(Math.random() * 20) + 10) / 10; // 1.0~2.9
      let b = (Math.floor(Math.random() * 15) + 5) / 10;  // 0.5~1.9
      if (Math.random() > 0.5) {
        return { text: `${a.toFixed(1)} + ${b.toFixed(1)} = ?`, answer: String((a + b).toFixed(1)) };
      } else {
        let sum = a + b;
        return { text: `${sum.toFixed(1)} - ${a.toFixed(1)} = ?`, answer: String(b.toFixed(1)) };
      }
    }
  },
  "4-2-12": {
    desc: "다각형 둘레 계산",
    areas: ["정다각형의 둘레"],
    generate: (area, diff) => {
      let len = Math.floor(Math.random() * 8) + 3; // side length 3~10
      const polygonNames = ["정삼각형", "정사각형", "정오각형", "정육각형"];
      const polygonSides = [3, 4, 5, 6];
      const idx = Math.floor(Math.random() * 4);
      return { text: `한 변의 길이가 ${len}cm인 ${polygonNames[idx]}의 둘레는 몇 cm일까요?`, answer: String(len * polygonSides[idx]) };
    }
  },

  // --- GRADE 5 ---
  "5-1-3": {
    desc: "자연수의 혼합 계산",
    areas: ["괄호가 있는 혼합 계산"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 10) + 15;
      let b = Math.floor(Math.random() * 8) + 2;
      let c = Math.floor(Math.random() * 4) + 2;
      return { text: `${a} - ${b} x ${c} = ?`, answer: String(a - b * c) };
    }
  },
  "5-1-4": {
    desc: "약수와 배수",
    areas: ["최대공약수", "최소공배수"],
    generate: (area, diff) => {
      if (area === "최대공약수") {
        const pairs = [[12, 18, 6], [8, 12, 4], [15, 20, 5], [16, 24, 8]];
        const pair = pairs[Math.floor(Math.random() * pairs.length)];
        return { text: `${pair[0]}와 ${pair[1]}의 최대공약수는 무엇일까요?`, answer: String(pair[2]) };
      } else {
        const pairs = [[8, 12, 24], [6, 9, 18], [10, 15, 30], [12, 15, 60]];
        const pair = pairs[Math.floor(Math.random() * pairs.length)];
        return { text: `${pair[0]}와 ${pair[1]}의 최소공배수는 무엇일까요?`, answer: String(pair[2]) };
      }
    }
  },
  "5-1-5": {
    desc: "약분과 통분",
    areas: ["분수 기약화", "분수 통분"],
    generate: (area, diff) => {
      if (area === "분수 기약화") {
        const fractions = [["4/6", "2/3"], ["6/8", "3/4"], ["5/15", "1/3"], ["8/12", "2/3"]];
        const frac = fractions[Math.floor(Math.random() * fractions.length)];
        return { text: `분수 ${frac[0]}을 가장 간단하게 약분(기약분수 A/B)하세요.`, answer: frac[1] };
      } else {
        const pairs = [["1/4, 1/6", 12], ["1/6, 2/9", 18], ["2/5, 1/3", 15]];
        const pair = pairs[Math.floor(Math.random() * pairs.length)];
        return { text: `${pair[0]}의 분모를 같게 만들 때, 가장 작은 공통분모는 무엇일까요?`, answer: String(pair[1]) };
      }
    }
  },
  "5-1-6": {
    desc: "분수의 덧셈과 뺄셈",
    areas: ["이분모 분수의 계산"],
    generate: (area, diff) => {
      if (diff === "하") {
        return { text: `1/2 + 1/3 = ? (답을 A/B 형태로 적으세요)`, answer: "5/6" };
      } else if (diff === "중") {
        return { text: `1/2 - 1/4 = ? (답을 A/B 형태로 적으세요)`, answer: "1/4" };
      } else {
        return { text: `2/3 + 1/4 = ? (답을 A/B 형태로 적으세요)`, answer: "11/12" };
      }
    }
  },
  "5-1-7": {
    desc: "분수의 곱셈",
    areas: ["분수의 곱셈"],
    generate: (area, diff) => {
      let num1 = Math.floor(Math.random() * 3) + 1;
      let den1 = 5;
      let num2 = Math.floor(Math.random() * 2) + 1;
      let den2 = 3;
      return { text: `${num1}/${den1} x ${num2}/${den2} = ? (답을 A/B 형태로 적으세요)`, answer: `${num1 * num2}/${den1 * den2}` };
    }
  },
  "5-2-9": {
    desc: "올림/버림/반올림",
    areas: ["반올림", "버림"],
    generate: (area, diff) => {
      let num = Math.floor(Math.random() * 400) + 520; // 520~920
      if (area === "반올림") {
        let rounded = Math.round(num / 10) * 10;
        return { text: `${num}을 일의 자리에서 반올림하여 십의 자리까지 나타내면 얼마일까요?`, answer: String(rounded) };
      } else {
        let discarded = Math.floor(num / 100) * 100;
        return { text: `${num}을 십의 자리에서 버림하여 백의 자리까지 나타내면 얼마일까요?`, answer: String(discarded) };
      }
    }
  },
  "5-2-10": {
    desc: "소수의 곱셈",
    areas: ["소수의 곱셈"],
    generate: (area, diff) => {
      let a = (Math.floor(Math.random() * 9) + 1) / 10; // 0.1~0.9
      let b = (Math.floor(Math.random() * 9) + 1) / 10;
      let val = (a * b).toFixed(2);
      return { text: `${a} x ${b} = ?`, answer: String(parseFloat(val)) };
    }
  },
  "5-2-11": {
    desc: "도형의 넓이",
    areas: ["삼각형 넓이", "평행사변형 넓이"],
    generate: (area, diff) => {
      let b = Math.floor(Math.random() * 8) + 4; // base 4~11
      let h = Math.floor(Math.random() * 6) + 4; // height 4~9
      if (area === "삼각형 넓이") {
        // base * height / 2. Ensure even base to keep answer whole or clean decimal.
        if (b % 2 !== 0 && h % 2 !== 0) { b += 1; }
        return { text: `밑변이 ${b}cm, 높이가 ${h}cm인 삼각형의 넓이는 몇 cm²일까요?`, answer: String(b * h / 2) };
      } else {
        return { text: `밑변이 ${b}cm, 높이가 ${h}cm인 평행사변형의 넓이는 몇 cm²일까요?`, answer: String(b * h) };
      }
    }
  },
  "5-2-12": {
    desc: "평균과 가능성",
    areas: ["자료의 평균"],
    generate: (area, diff) => {
      let a = Math.floor(Math.random() * 30) + 60; // 60~90
      let b = a + (Math.random() > 0.5 ? 10 : -10);
      let c = a * 3 - (a + b);
      let avg = (a + b + c) / 3;
      return { text: `${a}, ${b}, ${c} 세 점수의 평균은 얼마일까요?`, answer: String(avg) };
    }
  },

  // --- GRADE 6 ---
  "6-1-3": {
    desc: "분수 ÷ 자연수",
    areas: ["분수의 나눗셈"],
    generate: (area, diff) => {
      let num = Math.floor(Math.random() * 3) + 2; // 2~4
      let den = 7;
      let div = Math.floor(Math.random() * 3) + 2; // 2~4
      if (diff === "하") {
        // clean division
        num = div * 2;
        return { text: `${num}/${den} ÷ ${div} = ? (답을 A/B 형태로 적으세요)`, answer: `${num / div}/${den}` };
      } else {
        return { text: `${num}/${den} ÷ ${div} = ? (답을 A/B 형태로 적으세요)`, answer: `${num}/${den * div}` };
      }
    }
  },
  "6-1-4": {
    desc: "소수 ÷ 자연수",
    areas: ["소수의 나눗셈"],
    generate: (area, diff) => {
      let a = (Math.floor(Math.random() * 15) + 5) / 10; // 0.5~1.9
      let b = Math.floor(Math.random() * 3) + 2;        // 2~4
      let val = a * b; // guarantee clean division
      return { text: `${val.toFixed(1)} ÷ ${b} = ?`, answer: String(a.toFixed(1)) };
    }
  },
  "6-1-5": {
    desc: "비와 비율",
    areas: ["비율 구하기", "백분율 변환"],
    generate: (area, diff) => {
      if (area === "비율 구하기") {
        const base = 10;
        const comp = Math.floor(Math.random() * 8) + 1; // 1~8
        return { text: `${comp} 대 ${base} 의 비율은 무엇일까요? (소수로 적으세요)`, answer: String(comp / base) };
      } else {
        const base = 20;
        const comp = Math.floor(Math.random() * 15) + 3; // 3~17
        const percent = (comp / base) * 100;
        return { text: `${comp}/${base} 을 백분율(%)로 변환한 값(숫자만)은 무엇일까요?`, answer: String(percent) };
      }
    }
  },
  "6-1-6": {
    desc: "비율 그래프",
    areas: ["띠/원 그래프 수량 연산"],
    generate: (area, diff) => {
      const total = 500;
      const percent = [10, 20, 25, 40, 50][Math.floor(Math.random() * 5)];
      return { text: `전체 수량이 ${total}명인 원그래프에서 ${percent}%가 차지하는 수량은 몇 명일까요?`, answer: String(total * percent / 100) };
    }
  },
  "6-1-7": {
    desc: "직육면체 부피/겉넓이",
    areas: ["직육면체의 부피"],
    generate: (area, diff) => {
      let w = Math.floor(Math.random() * 5) + 3; // width 3~7
      let d = Math.floor(Math.random() * 4) + 3; // depth 3~6
      let h = Math.floor(Math.random() * 3) + 3; // height 3~5
      return { text: `가로 ${w}cm, 세로 ${d}cm, 높이 ${h}cm인 직육면체의 부피는 몇 cm³일까요?`, answer: String(w * d * h) };
    }
  },
  "6-2-9": {
    desc: "분수 ÷ 분수",
    areas: ["분수의 나눗셈"],
    generate: (area, diff) => {
      let num1 = Math.floor(Math.random() * 4) + 1; // 1~4
      let num2 = Math.floor(Math.random() * 3) + 1; // 1~3
      let den = 5;
      if (diff === "하") {
        // same denominator
        return { text: `${num1}/${den} ÷ ${num2}/${den} = ?`, answer: `${num1}/${num2}` };
      } else {
        // different denominator
        return { text: `${num1}/3 ÷ ${num2}/4 = ? (답을 A/B 형태로 적으세요)`, answer: `${num1 * 4}/${num2 * 3}` };
      }
    }
  },
  "6-2-10": {
    desc: "소수 ÷ 소수",
    areas: ["소수의 나눗셈"],
    generate: (area, diff) => {
      let a = (Math.floor(Math.random() * 12) + 3) / 10; // 0.3~1.4
      let b = (Math.floor(Math.random() * 4) + 2) / 10;  // 0.2~0.5
      let val = a * b; // guarantee clean division
      return { text: `${val.toFixed(2)} ÷ ${b.toFixed(1)} = ?`, answer: String(parseFloat(a.toFixed(1))) };
    }
  },
  "6-2-11": {
    desc: "비례식과 비례배분",
    areas: ["비례식 연산", "비례 배분"],
    generate: (area, diff) => {
      if (area === "비례식 연산") {
        let x = Math.floor(Math.random() * 8) + 2; // 2~9
        let mult = 3;
        return { text: `2 : 5 = ${2 * mult} : [ ] 의 빈칸에 알맞은 수는?`, answer: String(5 * mult) };
      } else {
        let ratio1 = 2;
        let ratio2 = 3;
        let mult = Math.floor(Math.random() * 10) + 10; // 10~19
        let total = (ratio1 + ratio2) * mult;
        return { text: `${total}을 ${ratio1} : ${ratio2}로 비례배분 할 때, 더 큰 쪽의 값은 무엇일까요?`, answer: String(ratio2 * mult) };
      }
    }
  },
  "6-2-12": {
    desc: "원기둥/원뿔의 계산",
    areas: ["원의 넓이", "원주의 길이"],
    generate: (area, diff) => {
      let r = [5, 10, 20][Math.floor(Math.random() * 3)];
      const pi = 3; // standard elementary simple pi
      if (area === "원주의 길이") {
        return { text: `반지름이 ${r}cm이고 원주율이 ${pi}일 때, 원주의 길이는 몇 cm일까요?`, answer: String(2 * r * pi) };
      } else {
        return { text: `반지름이 ${r}cm이고 원주율이 ${pi}일 때, 원의 넓이는 몇 cm²일까요?`, answer: String(r * r * pi) };
      }
    }
  }
};

// Helper to get active curriculum for current academic setting
function getCurriculumKey(grade, semester, month) {
  return `${grade}-${semester}-${month}`;
}

// 4. Adaptive Difficulty Engine
/**
 * Resolves dynamic recommended difficulty and generates a question.
 */
async function generateAdaptiveQuestion(userName, grade, semester, month) {
  const key = getCurriculumKey(grade, semester, month);
  const curriculum = curriculumMap[key];
  if (!curriculum) {
    return {
      text: "준비된 연산 문제가 없습니다.",
      answer: "0",
      area: "기타",
      difficulty: "하"
    };
  }

  // 1. Pick a random area from curriculum
  const area = curriculum.areas[Math.floor(Math.random() * curriculum.areas.length)];
  let recommendedDifficulty = '하'; // default

  try {
    console.log(`Calculating adaptive difficulty for user: ${userName}, area: ${area}...`);
    
    // Fetch latest 5 records from Supabase REST API
    const url = `${SUPABASE_URL}/rest/v1/learning_records?user_name=eq.${encodeURIComponent(userName)}&area=eq.${encodeURIComponent(area)}&order=created_at.desc&limit=5`;
    const response = await fetch(url, { method: 'GET', headers: supabaseHeaders });
    
    if (response.status === 200) {
      const records = await response.json();
      console.log('Recent learning records retrieved:', records.length);
      
      if (records.length >= 3) {
        // Calculate correctness rate of the LATEST difficulty level in history
        const currentDiff = records[0].difficulty;
        const matchingRecords = records.filter(r => r.difficulty === currentDiff);
        
        if (matchingRecords.length >= 3) {
          const correctCount = matchingRecords.filter(r => r.is_correct).length;
          const correctRatio = correctCount / matchingRecords.length;
          console.log(`Difficulty [${currentDiff}]: Correct ratio = ${correctRatio.toFixed(2)} (${correctCount}/${matchingRecords.length})`);
          
          if (correctRatio === 1.0) {
            // Promote difficulty
            if (currentDiff === '하') recommendedDifficulty = '중';
            else if (currentDiff === '중') recommendedDifficulty = '상';
            else recommendedDifficulty = '상';
          } else if (correctRatio < 0.6) {
            // Demote difficulty
            if (currentDiff === '상') recommendedDifficulty = '중';
            else if (currentDiff === '중') recommendedDifficulty = '하';
            else recommendedDifficulty = '하';
          } else {
            // Stay at current
            recommendedDifficulty = currentDiff;
          }
        } else {
          // Default to the latest difficulty tried
          recommendedDifficulty = currentDiff;
        }
      }
    }
  } catch (err) {
    console.warn('Supabase fetch failed during adaptive check. Falling back to local storage analysis.', err);
    // Local fallback check
    const localHistory = getLocalHistory(userName).filter(r => r.area === area);
    if (localHistory.length >= 3) {
      const currentDiff = localHistory[0].difficulty;
      const matching = localHistory.filter(r => r.difficulty === currentDiff);
      if (matching.length >= 3) {
        const correctCount = matching.filter(r => r.is_correct).length;
        const correctRatio = correctCount / matching.length;
        if (correctRatio === 1.0) {
          recommendedDifficulty = currentDiff === '하' ? '중' : (currentDiff === '중' ? '상' : '상');
        } else if (correctRatio < 0.6) {
          recommendedDifficulty = currentDiff === '상' ? '중' : (currentDiff === '중' ? '하' : '하');
        } else {
          recommendedDifficulty = currentDiff;
        }
      }
    }
  }

  // Generate question
  const qData = curriculum.generate(area, recommendedDifficulty);
  return {
    text: qData.text,
    answer: qData.answer,
    area: area,
    difficulty: recommendedDifficulty
  };
}

// 5. Supabase & Local Database Actions
async function fetchUserStatistics(userName) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/learning_records?user_name=eq.${encodeURIComponent(userName)}&order=created_at.desc`;
    const response = await fetch(url, { method: 'GET', headers: supabaseHeaders });
    if (response.status === 200) {
      const records = await response.json();
      state.historyCache = records;
      return calculateStats(records);
    }
  } catch (err) {
    console.warn('Could not query stats from Supabase. Loading from LocalStorage.', err);
  }
  
  // Fallback to local storage
  const records = getLocalHistory(userName);
  state.historyCache = records;
  return calculateStats(records);
}

function calculateStats(records) {
  if (records.length === 0) {
    return { count: 0, accuracy: 0, avgTime: 0, trendAcc: 0, trendTime: 0 };
  }
  
  const total = records.length;
  const correct = records.filter(r => r.is_correct).length;
  const accuracy = Math.round((correct / total) * 100);
  
  const totalTime = records.reduce((sum, r) => sum + r.time_spent_ms, 0);
  const avgTime = Math.round((totalTime / total) / 100) / 10; // seconds

  // Trend analysis (compare last 5 with overall before)
  let trendAcc = 0;
  let trendTime = 0;
  if (total >= 10) {
    const last5 = records.slice(0, 5);
    const prev = records.slice(5);
    
    const last5Acc = last5.filter(r => r.is_correct).length / 5;
    const prevAcc = prev.filter(r => r.is_correct).length / prev.length;
    trendAcc = Math.round((last5Acc - prevAcc) * 100);

    const last5Time = last5.reduce((sum, r) => sum + r.time_spent_ms, 0) / 5;
    const prevTime = prev.reduce((sum, r) => sum + r.time_spent_ms, 0) / prev.length;
    trendTime = Math.round((last5Time - prevTime) / 100) / 10;
  }

  return { count: total, accuracy, avgTime, trendAcc, trendTime };
}

async function fetchAreaProficiency(userName, grade, semester, month) {
  const key = getCurriculumKey(grade, semester, month);
  const curriculum = curriculumMap[key];
  if (!curriculum) return [];

  const result = [];
  
  for (const area of curriculum.areas) {
    let diff = '하';
    let progress = 20; // default indicator width

    // Filter records in our loaded cache
    const matching = state.historyCache.filter(r => r.area === area);
    if (matching.length > 0) {
      // Find latest difficulty
      diff = matching[0].difficulty;
      const count = matching.length;
      const correct = matching.filter(r => r.is_correct).length;
      progress = Math.round((correct / count) * 100);
    }

    result.push({ area, difficulty: diff, progress });
  }

  return result;
}

async function insertLearningRecord(record) {
  // Try sending to Supabase
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/learning_records`, {
      method: 'POST',
      headers: supabaseHeaders,
      body: JSON.stringify(record)
    });
    if (response.status === 201 || response.status === 200) {
      console.log('Record successfully pushed to Supabase!');
    }
  } catch (err) {
    console.warn('Network offline or Supabase blocked. Storing locally.', err);
  }
  
  // Always store locally as redundant backup
  saveLocalHistory(record.user_name, record);
}

// LocalStorage helpers for fully resilient operations
function getLocalHistory(userName) {
  const raw = localStorage.getItem(`calcal_history_${userName}`);
  return raw ? JSON.parse(raw) : [];
}

function saveLocalHistory(userName, record) {
  const history = getLocalHistory(userName);
  history.unshift(record); // Prepend so index 0 is newest
  localStorage.setItem(`calcal_history_${userName}`, JSON.stringify(history));
}

// 6. Growth Chart Dashboard Renderer (Canvas API)
function renderGrowthChart(history) {
  const canvas = document.getElementById('analytics-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Set dimensions correctly for high-DPI displays
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.clearRect(0, 0, width, height);

  // If no history, draw background placeholder
  if (!history || history.length === 0) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = '500 14px Noto Sans KR';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('문제를 몇 번 풀면 여기에 성장 그래프가 그려집니다!', width / 2, height / 2);
    return;
  }

  // Slice last 15 attempts and reverse so they are chronological (left to right)
  const data = history.slice(0, 15).reverse();
  const count = data.length;

  // Layout boundaries
  const paddingLeft = 40;
  const paddingRight = 40;
  const paddingTop = 20;
  const paddingBottom = 30;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Draw background grids
  ctx.strokeStyle = document.documentElement.classList.contains('theme-dark') ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = paddingTop + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
    
    // Label y-axis (Accuracy left 0-100%)
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.font = '600 9px Outfit';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${100 - i * 25}%`, paddingLeft - 8, y);
  }

  const getX = (index) => paddingLeft + (chartWidth / Math.max(1, count - 1)) * index;
  
  // Y scaling
  // Accuracy: 0 to 100
  const getAccY = (accVal) => paddingTop + chartHeight - (chartHeight * accVal) / 100;
  // Speed: 0 to max speed (let's say cap at 10 seconds for visual balance)
  const maxSeconds = 10;
  const getSpeedY = (speedMs) => {
    const seconds = speedMs / 1000;
    const boundedSec = Math.min(seconds, maxSeconds);
    return paddingTop + chartHeight - (chartHeight * boundedSec) / maxSeconds;
  };

  // 1. Draw ACCURACY LINE (Solid Purple)
  ctx.beginPath();
  data.forEach((r, idx) => {
    const x = getX(idx);
    const y = getAccY(r.is_correct ? 100 : 0); // discrete in history, but maps well to rolling curves
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#6366F1';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Dots for accuracy
  data.forEach((r, idx) => {
    const x = getX(idx);
    const y = getAccY(r.is_correct ? 100 : 0);
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#6366F1';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  });

  // 2. Draw SPEED LINE (Solid Cyan)
  ctx.beginPath();
  data.forEach((r, idx) => {
    const x = getX(idx);
    const y = getSpeedY(r.time_spent_ms);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#06B6D4';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Dots for speed
  data.forEach((r, idx) => {
    const x = getX(idx);
    const y = getSpeedY(r.time_spent_ms);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#06B6D4';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  });

  // Bottom Label X Axis (Attempts)
  ctx.fillStyle = 'var(--text-muted)';
  ctx.font = '600 8px Outfit';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  data.forEach((r, idx) => {
    const x = getX(idx);
    ctx.fillText(`#${idx + 1}`, x, paddingTop + chartHeight + 8);
  });
}

// 7. Interactive UI & Screen Navigation Engine
function initTheme() {
  const saved = localStorage.getItem('calcal_theme') || 'theme-light';
  document.documentElement.className = saved;
  updateThemeIcon();

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('theme-dark');
    const next = isDark ? 'theme-light' : 'theme-dark';
    document.documentElement.className = next;
    localStorage.setItem('calcal_theme', next);
    updateThemeIcon();
    
    // Redraw graph if visible
    if (state.currentUser) {
      renderGrowthChart(state.historyCache);
    }
  });
}

function updateThemeIcon() {
  // The CSS automatically handles displaying the correct SVG, we just need to keep root class matched
}

function navigateTo(targetViewId) {
  const views = ['login-view', 'dashboard-view', 'quiz-view'];
  
  const updateDOM = () => {
    views.forEach(id => {
      const el = document.getElementById(id);
      if (id === targetViewId) {
        el.classList.remove('hidden');
        el.classList.add('active-view');
      } else {
        el.classList.add('hidden');
        el.classList.remove('active-view');
      }
    });

    // Header visibility control
    const profile = document.getElementById('user-profile');
    if (targetViewId === 'login-view') {
      profile.classList.add('hidden');
    } else {
      profile.classList.remove('hidden');
      document.getElementById('header-username').textContent = state.currentUser;
      
      const avatarContainer = document.getElementById('user-avatar-placeholder');
      avatarContainer.textContent = state.currentUser === '학습자 1' ? '🦊' : '🐨';
      avatarContainer.className = `user-avatar-small ${state.currentUser === '학습자 1' ? 'avatar-bg-1' : 'avatar-bg-2'}`;
    }
  };

  // Modern View Transitions support
  if (document.startViewTransition) {
    document.startViewTransition(updateDOM);
  } else {
    updateDOM();
  }
}

// Toast alerts helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button style="background:none;border:none;margin-left:1rem;cursor:pointer;color:inherit;font-weight:700">✕</button>
  `;
  
  toast.querySelector('button').addEventListener('click', () => {
    toast.remove();
  });
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// 8. Dashboard State updates
async function updateDashboardData() {
  const userName = state.currentUser;
  
  // Show spinner
  const profContainer = document.getElementById('proficiency-container');
  profContainer.innerHTML = '<div class="loading-spinner-small"></div>';

  // 1. Fetch user records
  const stats = await fetchUserStatistics(userName);
  
  // 2. Set stats values in UI
  document.getElementById('stat-total-solved').textContent = stats.count;
  document.getElementById('stat-avg-accuracy').textContent = `${stats.accuracy}%`;
  document.getElementById('stat-avg-time').textContent = `${stats.avgTime.toFixed(1)}초`;

  // Render trend badges
  const accTrend = document.getElementById('stat-accuracy-trend');
  if (stats.count < 10) {
    accTrend.className = 'stat-trend trend-neutral';
    accTrend.textContent = '진단 중';
  } else {
    if (stats.trendAcc > 0) {
      accTrend.className = 'stat-trend trend-up';
      accTrend.textContent = `▲ ${stats.trendAcc}%`;
    } else if (stats.trendAcc < 0) {
      accTrend.className = 'stat-trend trend-down';
      accTrend.textContent = `▼ ${Math.abs(stats.trendAcc)}%`;
    } else {
      accTrend.className = 'stat-trend trend-neutral';
      accTrend.textContent = '변화 없음';
    }
  }

  const timeTrend = document.getElementById('stat-time-trend');
  if (stats.count < 10) {
    timeTrend.className = 'stat-trend trend-neutral';
    timeTrend.textContent = '진단 중';
  } else {
    if (stats.trendTime < 0) { // Speeding up! (lower seconds is better)
      timeTrend.className = 'stat-trend trend-up';
      timeTrend.textContent = `▲ ${Math.abs(stats.trendTime).toFixed(1)}초 단축`;
    } else if (stats.trendTime > 0) {
      timeTrend.className = 'stat-trend trend-down';
      timeTrend.textContent = `▼ ${stats.trendTime.toFixed(1)}초 지연`;
    } else {
      timeTrend.className = 'stat-trend trend-neutral';
      timeTrend.textContent = '변화 없음';
    }
  }

  // 3. Render Canvas Curve
  renderGrowthChart(state.historyCache);

  // 4. Load curriculum details
  const key = getCurriculumKey(state.currentGrade, state.currentSemester, state.currentMonth);
  const curriculum = curriculumMap[key];
  const curriculumText = document.getElementById('curriculum-text');
  
  if (curriculum) {
    curriculumText.textContent = `${curriculum.desc} (${curriculum.areas.join(', ')})`;
  } else {
    curriculumText.textContent = '연산 과정이 등록되지 않았습니다.';
  }

  // 5. Render areas proficiency progress bars
  const profs = await fetchAreaProficiency(userName, state.currentGrade, state.currentSemester, state.currentMonth);
  
  profContainer.innerHTML = '';
  if (profs.length === 0) {
    profContainer.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);text-align:center">진도를 선택해 주세요.</p>';
  } else {
    profs.forEach(p => {
      const badgeClass = p.difficulty === '상' ? 'badge-diff-high' : (p.difficulty === '중' ? 'badge-diff-med' : 'badge-diff-low');
      const fillClass = p.difficulty === '상' ? 'fill-high' : (p.difficulty === '중' ? 'fill-med' : 'fill-low');
      
      const el = document.createElement('div');
      el.className = 'prof-item';
      el.innerHTML = `
        <div class="prof-header">
          <span class="prof-title">${p.area}</span>
          <span class="prof-badge ${badgeClass}">권장 난이도: ${p.difficulty}</span>
        </div>
        <div class="prof-bar-container">
          <div class="prof-bar-fill ${fillClass}" style="width: ${p.progress}%"></div>
        </div>
        <div class="prof-footer-info">
          <span>최근 성취도</span>
          <span>${p.progress}%</span>
        </div>
      `;
      profContainer.appendChild(el);
    });
  }
}

// 9. Immersive Quiz Controller
async function startQuiz() {
  state.quizActive = true;
  state.questionIndex = 1;
  
  // Set up immersive views
  navigateTo('quiz-view');
  
  // Generate first question
  await loadNextQuestion();
}

async function loadNextQuestion() {
  const answerInput = document.getElementById('quiz-answer-input');
  answerInput.value = '';
  answerInput.focus();

  // Highlight quiz UI progress
  document.getElementById('quiz-progress-text').textContent = `트레이닝 문제 #${state.questionIndex}`;

  // Generate question using adaptive engine
  const question = await generateAdaptiveQuestion(
    state.currentUser,
    state.currentGrade,
    state.currentSemester,
    state.currentMonth
  );

  state.currentQuestion = question;

  // Set Labels
  document.getElementById('quiz-area-label').textContent = question.area;
  
  const diffLabel = document.getElementById('quiz-diff-label');
  diffLabel.textContent = `난이도: ${question.difficulty}`;
  diffLabel.className = `quiz-badge badge-diff ${question.difficulty === '상' ? 'badge-diff-high' : (question.difficulty === '중' ? 'badge-diff-med' : 'badge-diff-low')}`;

  // Display math expression
  document.getElementById('math-expression').textContent = question.text.replace('?', '').trim();

  // Reset and Launch Stopwatch timer
  state.timeSpentMs = 0;
  state.timeStarted = performance.now();
  
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  const timerDisplay = document.getElementById('stopwatch-display');
  state.timerInterval = setInterval(() => {
    state.timeSpentMs = Math.round(performance.now() - state.timeStarted);
    const secs = (state.timeSpentMs / 1000).toFixed(1);
    timerDisplay.textContent = `⏱️ ${secs}초`;
  }, 100);
}

function handleVirtualKey(key) {
  if (!state.quizActive) return;
  const input = document.getElementById('quiz-answer-input');
  
  if (key === 'Backspace') {
    input.value = input.value.slice(0, -1);
  } else if (key === 'Enter') {
    submitAnswer();
  } else {
    // Limit inputs length
    if (input.value.length < 12) {
      input.value += key;
    }
  }
}

async function submitAnswer() {
  if (!state.quizActive) return;
  
  const input = document.getElementById('quiz-answer-input');
  const userAns = input.value.trim();
  if (userAns === '') {
    showToast('답을 먼저 입력해 주세요!', 'error');
    return;
  }

  // STOP TIMER
  clearInterval(state.timerInterval);

  const correctAns = state.currentQuestion.answer;
  const isCorrect = isAnswerCorrect(userAns, correctAns);
  const timeTaken = state.timeSpentMs;

  // Prepare database record object
  const record = {
    user_name: state.currentUser,
    grade: state.currentGrade,
    semester: state.currentSemester,
    month: state.currentMonth,
    area: state.currentQuestion.area,
    difficulty: state.currentQuestion.difficulty,
    question_text: state.currentQuestion.text,
    correct_answer: correctAns,
    user_answer: userAns,
    is_correct: isCorrect,
    time_spent_ms: timeTaken
  };

  // Show Splash animations on top of Card
  const card = document.getElementById('quiz-card');
  const splash = document.createElement('div');
  
  if (isCorrect) {
    splash.className = 'splash-overlay splash-correct';
    splash.innerHTML = `
      <svg class="splash-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      <div class="splash-text">참 잘했어요!</div>
      <div style="font-size:0.9rem;margin-top:0.35rem">풀이 속도: ${(timeTaken / 1000).toFixed(1)}초</div>
    `;
    card.appendChild(splash);
    
    // Save to Database
    await insertLearningRecord(record);

    // Auto-advance after 1.2s
    setTimeout(() => {
      splash.remove();
      state.questionIndex++;
      loadNextQuestion();
    }, 1200);
    
  } else {
    splash.className = 'splash-overlay splash-incorrect';
    splash.innerHTML = `
      <svg class="splash-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      <div class="splash-text">아쉽습니다!</div>
      <div style="font-size:0.9rem;margin-top:0.35rem">다시 도전해 보세요.</div>
    `;
    card.appendChild(splash);
    card.classList.add('shake');

    // Remove shake & splash, allowing a retry on the exact same question!
    setTimeout(() => {
      splash.remove();
      card.classList.remove('shake');
      
      // Resume stopwatch timer
      state.timeStarted = performance.now() - state.timeSpentMs; // credit already elapsed time
      const timerDisplay = document.getElementById('stopwatch-display');
      state.timerInterval = setInterval(() => {
        state.timeSpentMs = Math.round(performance.now() - state.timeStarted);
        timerDisplay.textContent = `⏱️ ${(state.timeSpentMs / 1000).toFixed(1)}초`;
      }, 100);
      
      input.value = '';
      input.focus();
    }, 1200);
  }
}

function exitQuiz() {
  state.quizActive = false;
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  // Redraw dashboard stats
  updateDashboardData();
  navigateTo('dashboard-view');
}

// 10. Application Initializer
function initApp() {
  // Theme init
  initTheme();

  // Login Cards Actions
  const cards = document.querySelectorAll('.student-card');
  const loginBtn = document.getElementById('login-action-btn');
  
  let selectedStudent = null;

  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedStudent = card.getAttribute('data-student');
      loginBtn.disabled = false;
    });
  });

  // Login Action Trigger
  loginBtn.addEventListener('click', () => {
    if (!selectedStudent) return;
    state.currentUser = selectedStudent;
    
    showToast(`${selectedStudent}님, 환영합니다! 🚀`, 'success');
    
    // Navigate to Dashboard
    updateDashboardData();
    navigateTo('dashboard-view');
  });

  // Logout Trigger
  document.getElementById('logout-btn').addEventListener('click', () => {
    state.currentUser = null;
    selectedStudent = null;
    cards.forEach(c => c.classList.remove('selected'));
    loginBtn.disabled = true;
    navigateTo('login-view');
  });

  // Dashboard selections change listeners
  const gradeSel = document.getElementById('grade-select');
  const semSel = document.getElementById('semester-select');
  const monthSel = document.getElementById('month-select');

  const updateMonths = () => {
    const sem = semSel.value;
    monthSel.innerHTML = '';
    
    if (sem === '1') {
      monthSel.innerHTML = `
        <option value="3">3월</option>
        <option value="4">4월</option>
        <option value="5">5월</option>
        <option value="6">6월</option>
        <option value="7">7월</option>
      `;
    } else {
      monthSel.innerHTML = `
        <option value="9">9월</option>
        <option value="10">10월</option>
        <option value="11">11월</option>
        <option value="12">12월</option>
      `;
    }
  };

  semSel.addEventListener('change', () => {
    updateMonths();
    state.currentSemester = parseInt(semSel.value);
    state.currentMonth = parseInt(monthSel.value);
    updateDashboardData();
  });

  gradeSel.addEventListener('change', () => {
    state.currentGrade = parseInt(gradeSel.value);
    updateDashboardData();
  });

  monthSel.addEventListener('change', () => {
    state.currentMonth = parseInt(monthSel.value);
    updateDashboardData();
  });

  // Quiz Control buttons
  document.getElementById('start-learning-btn').addEventListener('click', startQuiz);
  document.getElementById('exit-quiz-btn').addEventListener('click', exitQuiz);

  // Virtual Keyboard event delegation
  document.querySelectorAll('.key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      handleVirtualKey(key);
    });
  });

  // Physical Keyboard input capturing
  document.addEventListener('keydown', (e) => {
    if (!state.quizActive) return;
    
    const validKeys = [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      '.', '/', 'Backspace', 'Enter'
    ];
    
    if (validKeys.includes(e.key)) {
      e.preventDefault();
      handleVirtualKey(e.key);
    }
  });

  // Initialize initial academic select states
  updateMonths();
  state.currentGrade = parseInt(gradeSel.value);
  state.currentSemester = parseInt(semSel.value);
  state.currentMonth = parseInt(monthSel.value);
}

// Start core app when DOM is fully prepared
document.addEventListener('DOMContentLoaded', initApp);

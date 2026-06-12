/* Gen Alpha Academy — fee constants & calculators (mirrors v1 business rules) */
(function () {
  const FEES = {
    monthlyBase: 3500,
    admissionOneTime: 500,
    jerseyPerPair: 750,
    specialMonthly: 10000,
    plans: {
      monthly:    { label: "Monthly",                 months: 1, coaching: 3500 },
      quarterly:  { label: "3 months — 5% off",       months: 3, coaching: 9975 },
      halfyearly: { label: "6 months — 10% off",      months: 6, coaching: 18900 },
      special:    { label: "Special training",        months: 1, coaching: 10000 },
      custom:     { label: "Custom amount",           months: 1, coaching: 0 },
    },
  };

  /** Joining fee split: coaching + one-time admission + jersey pairs. */
  function joiningBreakdown(planKey, jerseyPairs, customAmount) {
    const plan = FEES.plans[planKey] || FEES.plans.monthly;
    const pairs = Math.max(0, Math.floor(Number(jerseyPairs) || 0));
    const jerseyAmount = pairs * FEES.jerseyPerPair;
    const coachingFee = planKey === "custom" ? Math.max(0, Number(customAmount) || 0) : plan.coaching;
    const admissionFee = FEES.admissionOneTime;
    return {
      planKey,
      months: plan.months,
      coachingFee,
      admissionFee,
      jerseyAmount,
      total: coachingFee + admissionFee + jerseyAmount,
    };
  }

  /** Renewal amount for a plan. */
  function renewalAmount(planKey) {
    const plan = FEES.plans[planKey] || FEES.plans.monthly;
    return plan.coaching;
  }

  window.GA_FEES = { FEES, joiningBreakdown, renewalAmount };
})();

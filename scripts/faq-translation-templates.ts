export const faqTranslationLocales = [
  'en',
  'zh-Hans',
  'zh-Hant',
  'ko',
] as const;

export type FaqTranslationLocale = (typeof faqTranslationLocales)[number];

export type FaqQuestionNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type FaqQ3AnswerVariant =
  | 'standard'
  | 'household'
  | 'health'
  | 'property'
  | 'payment'
  | 'identity';

export type FaqQ4AnswerVariant =
  | 'standard'
  | 'consultation'
  | 'field'
  | 'facility'
  | 'certificate'
  | 'payment';

export type FaqQ5AnswerVariant = 'standard' | 'deadline' | 'emergency';

export type FaqQ6AnswerVariant =
  | 'standard'
  | 'benefit'
  | 'usage'
  | 'certificate';

export type FaqQ10AnswerVariant =
  | 'standard'
  | 'sensitive'
  | 'property'
  | 'emergency';

export type FaqAnswerTemplates = Readonly<{
  q1: string;
  q2: string;
  q3: Readonly<Record<FaqQ3AnswerVariant, string>>;
  q4: Readonly<Record<FaqQ4AnswerVariant, string>>;
  q5: Readonly<Record<FaqQ5AnswerVariant, string>>;
  q6: Readonly<Record<FaqQ6AnswerVariant, string>>;
  q7: string;
  q8: string;
  q9: string;
  q10: Readonly<Record<FaqQ10AnswerVariant, string>>;
}>;

export type FaqTranslationTemplateSet = Readonly<{
  questions: Readonly<Record<FaqQuestionNumber, string>>;
  answers: FaqAnswerTemplates;
}>;

export type FaqTranslationTemplates = Readonly<
  Record<FaqTranslationLocale, FaqTranslationTemplateSet>
>;

export const faqTranslationTemplates = {
  en: {
    questions: {
      1: `Can I get advice about {category}?`,
      2: `Who or what situations are eligible for {category}?`,
      3: `What do I need for the {category} procedure?`,
      4: `Where can I complete the {category} procedure?`,
      5: `Are there any deadlines or application periods for {category}?`,
      6: `Are there any fees for {category}?`,
      7: `Can a representative or family member complete the {category} procedure?`,
      8: `What should I do if I need to change information or request reissuance for {category}?`,
      9: `Can I complete an application or reservation for {category} through this chat?`,
      10: `What should I do if the chat response does not answer my question about {category}?`,
    },
    answers: {
      q1: `The {department} of {municipality} provides information about {category}. The main topics are {topicTerms}. You can find an overview of the program, available service counters, application procedures, required documents, and important points.`,
      q2: `Eligibility varies by program or procedure. It may include people connected with {topicTerms}, registered residents of {municipality}, and people connected with facilities, roads, projects, or schools in the city.`,
      q3: {
        standard: `You may need an application form, identity verification documents, materials that describe the matter, contact information, and, when necessary, a power of attorney or other supporting documents.`,
        household: `You may need an application form, identity verification documents, documents confirming your household circumstances, proof of employment, proof of school or childcare enrollment, or materials describing the matter for consultation.`,
        health: `You may need identity verification documents, a health insurance card or eligibility certificate, a relevant certificate or booklet, documents confirming income or health status, a physician's opinion, or a long-term care insurance card.`,
        property: `You may need the location, plans, photographs, an application form, documents identifying the owner or manager, or materials describing the construction work or intended use.`,
        payment: `You may need a notice, payment slip, identity verification documents, materials showing the applicable fiscal year or program name, or bank account information. Individual amounts and payment status are confirmed only after identity verification.`,
        identity: `You may need identity verification documents, documents showing your relationship to the person concerned, a power of attorney, a notice, or an application form. Do not enter your Individual Number (My Number) or PIN in the chat.`,
      },
      q4: {
        standard: `Depending on the procedure, use {municipality}'s official website, the responsible department's service counter, telephone, online application, or postal mail.`,
        consultation: `Requests are accepted by telephone, at a service counter, through a local consultation center, by appointment, or at a medical institution, depending on the matter and its urgency.`,
        field: `Depending on the location and nature of the matter, use the official website guidance, a dedicated reception channel, an online application, telephone, or a request for an on-site inspection.`,
        facility: `Check or apply at the facility counter, through the public facility reservation system, by telephone, or online, depending on the facility and intended use.`,
        certificate: `Depending on the type of certificate or notification, use {municipality} City Hall, a branch office, a service office, a request by mail, an online application, or convenience-store issuance.`,
        payment: `Depending on the program, payment options may include a payment slip, bank account transfer, a financial institution, a convenience store, smartphone payment, or the Local Tax Payment Site.`,
      },
      q5: {
        standard: `An application, recruitment, lottery, or renewal period may be specified. Check the latest schedule on {municipality}'s official website or with the responsible department.`,
        deadline: `Some procedures have deadlines. Missing a deadline may affect benefits, certificates, the start of a service, voting, or the amount due, so check the deadline in the notice or application guidelines.`,
        emergency: `If the matter is urgent, do not wait for a deadline. Immediately contact the police, fire and ambulance services, a medical institution, a child guidance center, or the responsible department, as appropriate.`,
      },
      q6: {
        standard: `Some consultations are free, while certificates, facility use, or processing may carry fees. Check with the responsible department or on the official website to confirm whether a fee applies.`,
        benefit: `Grants and benefits may be subject to eligibility requirements, income limits, application deadlines, or budget caps. Applying does not guarantee that assistance will be awarded.`,
        usage: `Usage, service, processing, medical, or cancellation fees may apply. Charges vary by program, facility, and user category.`,
        certificate: `A fee may apply to certificate issuance. The amount varies by the type of certificate, how it is obtained, and the number of copies.`,
      },
      q7: `A representative or family member may be able to complete the procedure. However, identity verification documents, a power of attorney, and documents showing the relationship to the person concerned may be required. A procedure that requires confirmation of the person's intent may not be completed by a representative.`,
      q8: `If you need to make a change, request reissuance, cancel, withdraw, or submit additional material, prepare the reference number, notice, identity verification documents, and materials describing the change, then contact the responsible department.`,
      q9: `This chat can provide general guidance, but it cannot finalize an application or reservation, issue a certificate, conduct an individual review, verify identity, or determine eligibility for a benefit. Complete the formal procedure through the designated service counter, online application, postal mail, or reservation system.`,
      q10: {
        standard: `If the referenced knowledge does not provide enough information, do not make assumptions. Check the latest main telephone number in the footer of the {municipality} official website (zoom-gov-contact-center-demo) and ask to be connected to the {department}. Programs and application status may change. Check with the responsible department or on the official website for current information, decisions on individual cases, confirmed reservations, and review results.`,
        sensitive: `If the referenced knowledge does not provide enough information, do not make assumptions. Check the latest main telephone number in the footer of the {municipality} official website (zoom-gov-contact-center-demo) and ask to be connected to the {department}. Do not enter sensitive information such as your Individual Number, bank account details, PIN, income, medical history, or disability status in the chat. Matters requiring identity verification must be confirmed at a service counter or by telephone.`,
        property: `If the referenced knowledge does not provide enough information, do not make assumptions. Check the latest main telephone number in the footer of the {municipality} official website (zoom-gov-contact-center-demo) and ask to be connected to the {department}. The answer may vary depending on the location, ownership, site conditions, and legal restrictions. Do not proceed with construction, a contract, or an application based only on the chat response; confirm with the responsible department.`,
        emergency: `If the referenced knowledge does not provide enough information, do not make assumptions. Check the latest main telephone number in the footer of the {municipality} official website (zoom-gov-contact-center-demo) and ask to be connected to the {department}. In an emergency, prioritize primary sources such as the police (110), fire and ambulance services (119), medical institutions, evacuation information, or the responsible service counter instead of the chat.`,
      },
    },
  },
  'zh-Hans': {
    questions: {
      1: `可以咨询有关{category}的问题吗？`,
      2: `请告诉我哪些人员或情况属于{category}的适用对象。`,
      3: `办理{category}需要准备什么？`,
      4: `可以在哪里办理{category}？`,
      5: `{category}有办理期限或受理期间吗？`,
      6: `办理{category}需要付费吗？`,
      7: `代理人或家属也可以办理“{category}”吗？`,
      8: `如需变更{category}的内容或重新补发，应如何办理？`,
      9: `可以通过聊天完成“{category}”的申请或预约吗？`,
      10: `如果聊天回复未能解答我关于{category}的问题，该怎么办？`,
    },
    answers: {
      q1: `{municipality}的{department}提供{category}相关信息。主要内容包括{topicTerms}。您可以确认制度概要、可利用的服务窗口、申请方法、所需材料及注意事项。`,
      q2: `适用对象因制度或手续而异。与{topicTerms}有关的人员、在{municipality}办理居民登记的人员，以及与市内设施、道路、项目或学校等有关的人员，可能属于适用对象。`,
      q3: {
        standard: `可能需要申请表、身份证明材料、能够说明相关事项的资料、联系方式，以及视情况所需的委托书或其他相关资料。`,
        household: `可能需要申请表、身份证明材料、能够确认家庭情况的资料、就业证明、在学或在园证明，以及能够说明咨询内容的资料等。`,
        health: `可能需要身份证明材料、健康保险证或资格确认书、相关手册、能够确认收入或健康状况的资料、医生意见书或长期护理保险证等。`,
        property: `可能需要所在地信息、图纸、照片、申请表、能够确认所有者或管理者的资料，以及能够说明施工或使用内容的资料等。`,
        payment: `可能需要通知书、缴款单、身份证明材料、能够确认适用年度或制度名称的资料，以及银行账户信息等。具体金额和缴纳情况需在核实本人身份后查询。`,
        identity: `可能需要身份证明材料、能够确认与当事人关系的资料、委托书、通知书或申请表等。请勿在聊天中输入个人编号（My Number）或密码。`,
      },
      q4: {
        standard: `可根据手续内容，通过{municipality}官方网站、主管部门窗口、电话、在线申请或邮寄等方式办理。`,
        consultation: `可根据咨询内容和紧急程度，通过电话、服务窗口、地区咨询网点、预约咨询或医疗机构等方式受理。`,
        field: `可根据相关地点和事项内容，使用官方网站指引、专用受理渠道、在线申请、电话或现场确认申请等方式。`,
        facility: `可根据设施和使用目的，通过设施窗口、公共设施预约系统、电话或在线申请等方式查询或申请。`,
        certificate: `可根据证明或申报的种类，前往{municipality}市政府主办公楼、分支机构或联络处，也可通过邮寄申请、在线申请或便利店领取等方式办理。`,
        payment: `可根据适用制度，通过缴款单、银行自动扣款、金融机构、便利店、手机支付或地方税支付网站等方式缴纳。`,
      },
      q5: {
        standard: `可能设有受理期间、招募期间、抽签期间或更新时期。请在{municipality}官方网站或向主管部门确认最新日程。`,
        deadline: `部分手续设有期限。逾期可能会影响补助、证明、服务启用、投票或应缴金额等，请确认通知书或招募指南中规定的期限。`,
        emergency: `如情况紧急，请勿等待办理期限，应立即联系警察、消防或急救部门、医疗机构、儿童咨询所或主管部门等相应机构。`,
      },
      q6: {
        standard: `部分咨询免费，但办理证明、使用设施或相关处理可能收费。请向主管部门或通过官方网站确认是否需要付费。`,
        benefit: `补助或补贴可能设有适用条件、收入限制、申请期限或预算上限。提交申请并不代表一定能够获得。`,
        usage: `可能收取使用费、服务费、手续费、医疗费或取消费用等。费用因制度、设施和使用类别而异。`,
        certificate: `开具证明可能需要支付手续费。金额因证明种类、领取方式和份数而异。`,
      },
      q7: `代理人或家属有时可以办理相关手续，但可能需要身份证明材料、委托书及能够确认与当事人关系的资料。需要确认本人意愿的手续，可能无法由代理人完成。`,
      q8: `如需变更、补发、取消、撤回或补交资料，请准备受理编号、通知书、身份证明材料及能够说明变更内容的资料，并向主管部门确认。`,
      q9: `本聊天可提供一般性指引，但无法完成申请或预约确认、开具证明、个别审查、身份核实或补助资格判定。正式手续请通过指定窗口、在线申请、邮寄或预约系统办理。`,
      q10: {
        standard: `如果所参考的知识库没有足够信息，请勿自行判断。请在{municipality}官方网站（zoom-gov-contact-center-demo）页面底部确认最新总机号码，并要求转接至{department}。制度或受理情况可能发生变化。最新信息、个别情况判断、预约确认及审查结果，请向主管部门或通过官方网站确认。`,
        sensitive: `如果所参考的知识库没有足够信息，请勿自行判断。请在{municipality}官方网站（zoom-gov-contact-center-demo）页面底部确认最新总机号码，并要求转接至{department}。请勿在聊天中输入个人编号、银行账户信息、密码、收入、病史或残障情况等敏感信息。需要核实本人身份的事项，请在窗口或通过电话确认。`,
        property: `如果所参考的知识库没有足够信息，请勿自行判断。请在{municipality}官方网站（zoom-gov-contact-center-demo）页面底部确认最新总机号码，并要求转接至{department}。具体判断可能因所在地、所有权关系、现场情况和法律限制而异。请勿仅依据聊天回复进行施工、签订合同或提交申请，应向主管部门确认。`,
        emergency: `如果所参考的知识库没有足够信息，请勿自行判断。请在{municipality}官方网站（zoom-gov-contact-center-demo）页面底部确认最新总机号码，并要求转接至{department}。紧急情况下，请勿依赖聊天，应优先参考警察（110）、消防及急救（119）、医疗机构、避难信息或主管窗口等第一手信息。`,
      },
    },
  },
  'zh-Hant': {
    questions: {
      1: `可以諮詢有關{category}的問題嗎？`,
      2: `請告訴我哪些人員或情況屬於{category}的適用對象。`,
      3: `辦理{category}需要準備什麼？`,
      4: `可以在哪裡辦理{category}？`,
      5: `{category}有辦理期限或受理期間嗎？`,
      6: `辦理{category}需要付費嗎？`,
      7: `代理人或家屬也可以辦理「{category}」嗎？`,
      8: `如需變更{category}的內容或重新補發，應如何辦理？`,
      9: `可以透過聊天完成「{category}」的申請或預約嗎？`,
      10: `如果聊天回覆未能解答我關於{category}的問題，該怎麼辦？`,
    },
    answers: {
      q1: `{municipality}的{department}提供{category}相關資訊。主要內容包括{topicTerms}。您可以確認制度概要、可利用的服務窗口、申請方法、所需文件及注意事項。`,
      q2: `適用對象因制度或手續而異。與{topicTerms}有關的人員、在{municipality}辦理居民登記的人員，以及與市內設施、道路、計畫或學校等有關的人員，可能屬於適用對象。`,
      q3: {
        standard: `可能需要申請表、身分證明文件、能夠說明相關事項的資料、聯絡方式，以及視情況所需的委任書或其他相關資料。`,
        household: `可能需要申請表、身分證明文件、能夠確認家庭狀況的資料、就業證明、在學或在園證明，以及能夠說明諮詢內容的資料等。`,
        health: `可能需要身分證明文件、健康保險證或資格確認書、相關手冊、能夠確認收入或健康狀況的資料、醫師意見書或長期照護保險證等。`,
        property: `可能需要所在地資訊、圖面、照片、申請表、能夠確認所有人或管理人的文件，以及能夠說明工程或使用內容的資料等。`,
        payment: `可能需要通知書、繳款單、身分證明文件、能夠確認適用年度或制度名稱的資料，以及銀行帳戶資訊等。具體金額和繳納狀況需在核實本人身分後查詢。`,
        identity: `可能需要身分證明文件、能夠確認與當事人關係的資料、委任書、通知書或申請表等。請勿在聊天中輸入個人編號（My Number）或密碼。`,
      },
      q4: {
        standard: `可依手續內容，透過{municipality}官方網站、主管部門窗口、電話、線上申請或郵寄等方式辦理。`,
        consultation: `可依諮詢內容和緊急程度，透過電話、服務窗口、地區諮詢據點、預約諮詢或醫療機構等方式受理。`,
        field: `可依相關地點和事項內容，使用官方網站指引、專用受理管道、線上申請、電話或現場確認申請等方式。`,
        facility: `可依設施和使用目的，透過設施窗口、公共設施預約系統、電話或線上申請等方式查詢或申請。`,
        certificate: `可依證明或申報的種類，前往{municipality}市政府主辦公大樓、分支機構或聯絡處，也可透過郵寄申請、線上申請或便利商店核發等方式辦理。`,
        payment: `可依適用制度，透過繳款單、銀行自動扣款、金融機構、便利商店、行動支付或地方稅繳納網站等方式繳納。`,
      },
      q5: {
        standard: `可能設有受理期間、招募期間、抽籤期間或更新時期。請在{municipality}官方網站或向主管部門確認最新日程。`,
        deadline: `部分手續設有期限。逾期可能會影響補助、證明、服務啟用、投票或應繳金額等，請確認通知書或招募指南中規定的期限。`,
        emergency: `如情況緊急，請勿等待辦理期限，應立即聯絡警察、消防或救護單位、醫療機構、兒童諮詢所或主管部門等相應機構。`,
      },
      q6: {
        standard: `部分諮詢免費，但辦理證明、使用設施或相關處理可能收費。請向主管部門或透過官方網站確認是否需要付費。`,
        benefit: `補助或給付可能設有適用條件、收入限制、申請期限或預算上限。提交申請並不代表一定能夠獲得。`,
        usage: `可能收取使用費、服務費、手續費、醫療費或取消費用等。費用因制度、設施和使用類別而異。`,
        certificate: `核發證明可能需要支付手續費。金額因證明種類、領取方式和份數而異。`,
      },
      q7: `代理人或家屬有時可以辦理相關手續，但可能需要身分證明文件、委任書及能夠確認與當事人關係的資料。需要確認本人意願的手續，可能無法由代理人完成。`,
      q8: `如需變更、補發、取消、撤回或補交資料，請準備受理編號、通知書、身分證明文件及能夠說明變更內容的資料，並向主管部門確認。`,
      q9: `本聊天可提供一般性指引，但無法完成申請或預約確認、核發證明、個別審查、身分核實或補助資格判定。正式手續請透過指定窗口、線上申請、郵寄或預約系統辦理。`,
      q10: {
        standard: `如果所參考的知識庫沒有足夠資訊，請勿自行判斷。請在{municipality}官方網站（zoom-gov-contact-center-demo）頁面底部確認最新總機號碼，並要求轉接至{department}。制度或受理狀況可能發生變化。最新資訊、個別情況判斷、預約確認及審查結果，請向主管部門或透過官方網站確認。`,
        sensitive: `如果所參考的知識庫沒有足夠資訊，請勿自行判斷。請在{municipality}官方網站（zoom-gov-contact-center-demo）頁面底部確認最新總機號碼，並要求轉接至{department}。請勿在聊天中輸入個人編號、銀行帳戶資訊、密碼、收入、病史或身心障礙狀況等敏感資訊。需要核實本人身分的事項，請在窗口或透過電話確認。`,
        property: `如果所參考的知識庫沒有足夠資訊，請勿自行判斷。請在{municipality}官方網站（zoom-gov-contact-center-demo）頁面底部確認最新總機號碼，並要求轉接至{department}。具體判斷可能因所在地、所有權關係、現場狀況和法律限制而異。請勿僅依據聊天回覆進行施工、簽訂合約或提交申請，應向主管部門確認。`,
        emergency: `如果所參考的知識庫沒有足夠資訊，請勿自行判斷。請在{municipality}官方網站（zoom-gov-contact-center-demo）頁面底部確認最新總機號碼，並要求轉接至{department}。緊急情況下，請勿依賴聊天，應優先參考警察（110）、消防及救護（119）、醫療機構、避難資訊或主管窗口等第一手資訊。`,
      },
    },
  },
  ko: {
    questions: {
      1: `{category}에 대해 상담할 수 있나요?`,
      2: `{category}의 대상자나 해당 사례를 알려 주세요.`,
      3: `{category} 절차에는 무엇이 필요한가요?`,
      4: `{category} 절차는 어디에서 진행할 수 있나요?`,
      5: `{category}에 기한이나 접수 기간이 있나요?`,
      6: `{category}에 비용이 드나요?`,
      7: `대리인이나 가족도 '{category}' 절차를 진행할 수 있나요?`,
      8: `{category}의 내용 변경이나 재발급이 필요한 경우 어떻게 해야 하나요?`,
      9: `채팅으로 '{category}' 신청이나 예약을 완료할 수 있나요?`,
      10: `{category}에 관한 채팅 답변으로 궁금증이 해결되지 않으면 어떻게 해야 하나요?`,
    },
    answers: {
      q1: `{municipality}의 {department}에서는 {category}에 관한 안내를 제공합니다. 주요 내용은 {topicTerms}입니다. 제도의 개요, 이용 가능한 창구, 신청 방법, 필요 서류 및 유의 사항을 확인할 수 있습니다.`,
      q2: `대상은 제도나 절차에 따라 다릅니다. {topicTerms}와 관련된 분, {municipality}에 주민등록이 되어 있는 분, 시내 시설·도로·사업·학교 등과 관련된 분이 대상이 될 수 있습니다.`,
      q3: {
        standard: `신청서, 본인 확인 서류, 대상 내용을 확인할 수 있는 자료, 연락처와 필요에 따라 위임장이나 관계 자료 등이 필요할 수 있습니다.`,
        household: `신청서, 본인 확인 서류, 세대 상황을 확인할 수 있는 서류, 재직 증명서, 재학·재원 상황 또는 상담 내용을 확인할 수 있는 자료 등이 필요할 수 있습니다.`,
        health: `본인 확인 서류, 건강보험증 또는 자격확인서, 관련 수첩, 소득이나 건강 상태를 확인할 수 있는 서류, 의사 소견서 또는 장기요양보험증 등이 필요할 수 있습니다.`,
        property: `소재지, 도면, 사진, 신청서, 소유자나 관리자를 확인할 수 있는 서류 또는 공사나 이용 내용을 확인할 수 있는 자료 등이 필요할 수 있습니다.`,
        payment: `통지서, 납부서, 본인 확인 서류, 대상 연도나 제도명을 확인할 수 있는 자료 또는 계좌 정보 등이 필요할 수 있습니다. 개별 금액과 납부 상황은 본인 확인 후 확인합니다.`,
        identity: `본인 확인 서류, 대상자와의 관계를 확인할 수 있는 서류, 위임장, 통지서 또는 신청서 등이 필요할 수 있습니다. 개인번호(마이넘버)나 비밀번호는 채팅에 입력하지 마세요.`,
      },
      q4: {
        standard: `절차 내용에 따라 {municipality} 공식 웹사이트, 담당 부서 창구, 전화, 온라인 신청 또는 우편 등의 방법을 이용합니다.`,
        consultation: `상담 내용과 긴급도에 따라 전화, 창구, 지역 상담 거점, 예약 상담 또는 의료기관 등을 통해 접수합니다.`,
        field: `대상 장소와 내용에 따라 공식 웹사이트 안내, 전용 접수 창구, 온라인 신청, 전화 또는 현장 확인 요청 등의 방법을 이용합니다.`,
        facility: `시설과 이용 목적에 따라 시설 창구, 공공시설 예약 시스템, 전화 또는 온라인 신청 등을 통해 확인하거나 신청합니다.`,
        certificate: `증명서나 신고 종류에 따라 {municipality} 시청 본청사, 지소, 연락소, 우편 청구, 온라인 신청 또는 편의점 발급 등을 이용합니다.`,
        payment: `대상 제도에 따라 납부서, 계좌 이체, 금융기관, 편의점, 스마트폰 결제 또는 지방세 납부 사이트 등을 이용합니다.`,
      },
      q5: {
        standard: `접수 기간, 모집 기간, 추첨 기간 또는 갱신 시기가 정해져 있을 수 있습니다. 최신 일정은 {municipality} 공식 웹사이트나 담당 부서에서 확인하세요.`,
        deadline: `기한이 정해진 절차가 있습니다. 늦으면 급여, 증명서, 이용 개시, 투표 또는 납부액 등에 영향을 줄 수 있으므로 통지서나 모집 요강의 기한을 확인하세요.`,
        emergency: `긴급한 경우에는 기한을 기다리지 말고 경찰, 소방·구급, 의료기관, 아동상담소 또는 담당 부서 등에 즉시 연락하세요.`,
      },
      q6: {
        standard: `무료 상담도 있지만 증명서 발급, 시설 이용 또는 처리에는 비용이 들 수 있습니다. 비용 발생 여부는 담당 부서나 공식 웹사이트에서 확인하세요.`,
        benefit: `지원금이나 급여에는 대상 요건, 소득 제한, 신청 기한 또는 예산 상한이 있을 수 있습니다. 신청한다고 반드시 받을 수 있는 것은 아닙니다.`,
        usage: `이용료, 사용료, 처리 수수료, 진료비 또는 취소 수수료 등이 발생할 수 있습니다. 요금은 제도, 시설 및 이용 구분에 따라 다릅니다.`,
        certificate: `증명서 발급에는 수수료가 부과될 수 있습니다. 금액은 증명서 종류, 발급 방법 및 부수에 따라 다릅니다.`,
      },
      q7: `대리인이나 가족이 절차를 진행할 수 있는 경우가 있습니다. 다만 본인 확인 서류, 위임장, 대상자와의 관계를 확인할 수 있는 서류가 필요할 수 있습니다. 본인의 의사 확인이 필요한 절차는 대리로 완료할 수 없는 경우가 있습니다.`,
      q8: `변경, 재발급, 취소, 철회 또는 추가 제출이 필요한 경우 접수 번호, 통지서, 본인 확인 서류와 변경 내용을 확인할 수 있는 자료를 준비하여 담당 부서에 문의하세요.`,
      q9: `이 채팅에서는 일반적인 안내를 제공할 수 있지만 신청 확정, 예약 확정, 증명서 발급, 개별 심사, 본인 확인 또는 지급 가능 여부 판단은 할 수 없습니다. 정식 절차는 지정된 창구, 온라인 신청, 우편 또는 예약 시스템을 이용하세요.`,
      q10: {
        standard: `참조한 지식에 충분한 정보가 없으면 무리하게 판단하지 마세요. {municipality} 공식 웹사이트(zoom-gov-contact-center-demo) 하단에서 최신 대표 전화번호를 확인한 후 {department} 연결을 요청하세요. 제도나 접수 상황은 변경될 수 있습니다. 최신 정보, 개별 판단, 예약 확정 및 심사 결과는 담당 부서나 공식 웹사이트에서 확인하세요.`,
        sensitive: `참조한 지식에 충분한 정보가 없으면 무리하게 판단하지 마세요. {municipality} 공식 웹사이트(zoom-gov-contact-center-demo) 하단에서 최신 대표 전화번호를 확인한 후 {department} 연결을 요청하세요. 개인번호, 계좌 정보, 비밀번호, 소득, 병력 또는 장애 상태 등의 민감한 정보는 채팅에 입력하지 마세요. 본인 확인이 필요한 내용은 창구나 전화로 확인하세요.`,
        property: `참조한 지식에 충분한 정보가 없으면 무리하게 판단하지 마세요. {municipality} 공식 웹사이트(zoom-gov-contact-center-demo) 하단에서 최신 대표 전화번호를 확인한 후 {department} 연결을 요청하세요. 소재지, 소유 관계, 현장 상황 및 법령상 제한에 따라 판단이 달라질 수 있습니다. 채팅 답변만으로 공사, 계약 또는 신청을 진행하지 말고 담당 부서에 확인하세요.`,
        emergency: `참조한 지식에 충분한 정보가 없으면 무리하게 판단하지 마세요. {municipality} 공식 웹사이트(zoom-gov-contact-center-demo) 하단에서 최신 대표 전화번호를 확인한 후 {department} 연결을 요청하세요. 긴급할 때는 채팅이 아니라 경찰(110), 소방·구급(119), 의료기관, 대피 정보 또는 담당 창구 등의 1차 정보를 우선하세요.`,
      },
    },
  },
} as const satisfies FaqTranslationTemplates;

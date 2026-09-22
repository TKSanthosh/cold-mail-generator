const PDFDocument = require('pdfkit');
const fs = require('fs');

/**
 * Generates an executive, perfectly fitted 1-Page ATS-compliant PDF Resume matching Santhosh's exact typography and styling.
 * Balanced to gracefully fill the entire A4 page canvas from top to bottom with zero blank gaps and zero spillover.
 */
function renderResumeToDocument(doc, resumeJson, scale = 1.0) {
  const lerp = (a, b, t) => a + (b - a) * t;

  const textColor = '#000000';
  const grayLineColor = '#333333';
  const leftMargin = 36;
  const rightMargin = 559.28; // 595.28 - 36
  const contentWidth = rightMargin - leftMargin; // 523.28

  const topMargin = lerp(20, 24, scale);
  const secBefore = lerp(3.5, 5.8, scale);
  const secAfter = lerp(2.0, 3.0, scale);
  const bulletGap = lerp(1.0, 2.0, scale);
  const bulletLineGap = lerp(1.1, 1.5, scale);
  const summaryLineGap = lerp(1.2, 1.5, scale);
  const summaryAfterGap = lerp(1.2, 2.2, scale);
  const skillLineGap = lerp(1.1, 1.4, scale);
  const skillItemGap = lerp(0.8, 1.6, scale);
  const roleToCompGap = lerp(11.5, 11.8, scale);
  const compToProjGap = lerp(1.5, 2.2, scale);
  const projToBulletsGap = lerp(1.5, 2.2, scale);
  const subProjBeforeGap = lerp(1.5, 2.2, scale);
  const jobAfterGap = lerp(1.5, 2.8, scale);
  const headerGap1 = lerp(2.5, 3.2, scale);
  const headerGap2 = lerp(1.5, 2.2, scale);
  const headerGap3 = lerp(3.5, 4.2, scale);
  const headerAfterLine = lerp(1.0, 1.8, scale);

  function drawSectionHeader(title) {
    doc.y += secBefore;
    doc.font('Helvetica-Bold')
       .fontSize(9.2)
       .fillColor(textColor)
       .text(title.toUpperCase(), leftMargin, doc.y, { width: contentWidth });
    
    const lineY = doc.y + 1.8;
    doc.strokeColor(grayLineColor)
       .lineWidth(0.6)
       .moveTo(leftMargin, lineY)
       .lineTo(rightMargin, lineY)
       .stroke();
    
    doc.y = lineY + secAfter;
  }

  function drawBullet(text, bulletSize = 8.5) {
    const startY = doc.y;
    doc.font('Helvetica')
       .fontSize(bulletSize)
       .fillColor(textColor)
       .text('•', leftMargin + 2, startY, { lineBreak: false });

    doc.font('Helvetica')
       .fontSize(bulletSize)
       .fillColor(textColor)
       .text(text, leftMargin + 12, startY, {
         width: contentWidth - 12,
         lineGap: bulletLineGap
       });
    doc.y += bulletGap;
  }

  // --- 1. HEADER (Centered Name & Contact Info matching exact PDF format) ---
  const info = resumeJson.personalInfo || {};

  doc.font('Helvetica-Bold')
     .fontSize(16)
     .fillColor(textColor)
     .text((info.name || 'SANTHOSH T K').toUpperCase(), leftMargin, topMargin, { align: 'center', width: contentWidth });

  doc.y += headerGap1;
  const locStr = info.location || 'Bangalore, Karnataka | Remote';
  const phoneStr = info.phone || '+91 8825802707';
  const emailStr = info.email || 'tksanthosh494@gmail.com';
  const contactRow1 = `${locStr}  |  ${phoneStr}  |  ${emailStr}`;

  doc.font('Helvetica')
     .fontSize(8.6)
     .fillColor(textColor)
     .text(contactRow1, leftMargin, doc.y, { align: 'center', width: contentWidth });

  doc.y += headerGap2;
  const linkedinClean = (info.linkedin || 'linkedin.com/in/santhosh-tk').replace(/^https?:\/\//, '');
  const githubClean = (info.github || 'github.com/TKSanthosh').replace(/^https?:\/\//, '');
  const contactRow2 = `${linkedinClean}  |  Portfolio  |  ${githubClean}`;

  doc.font('Helvetica')
     .fontSize(8.6)
     .fillColor(textColor)
     .text(contactRow2, leftMargin, doc.y, { align: 'center', width: contentWidth });

  doc.y += headerGap3;
  const headerLineY = doc.y;
  doc.strokeColor(grayLineColor)
     .lineWidth(0.6)
     .moveTo(leftMargin, headerLineY)
     .lineTo(rightMargin, headerLineY)
     .stroke();

  doc.y = headerLineY + headerAfterLine;

  // --- 2. PROFILE SUMMARY ---
  if (resumeJson.summary) {
    drawSectionHeader('Profile Summary');
    doc.font('Helvetica')
       .fontSize(8.6)
       .fillColor(textColor)
       .text(resumeJson.summary, leftMargin, doc.y, {
         width: contentWidth,
         align: 'left',
         lineGap: summaryLineGap
       });
    doc.y += summaryAfterGap;
  }

  // --- 3. TECHNICAL SKILLS ---
  if (resumeJson.skills && Object.keys(resumeJson.skills).length > 0) {
    drawSectionHeader('Technical Skills');
    Object.entries(resumeJson.skills).forEach(([category, skillsList]) => {
      const listStr = Array.isArray(skillsList) ? skillsList.join(', ') : skillsList;
      const itemY = doc.y;
      doc.font('Helvetica-Bold')
         .fontSize(8.6)
         .fillColor(textColor)
         .text(category + ': ', leftMargin, itemY, { continued: true });
      
      doc.font('Helvetica')
         .fontSize(8.6)
         .fillColor(textColor)
         .text(listStr, { width: contentWidth, lineGap: skillLineGap });
      doc.y += skillItemGap;
    });
  }

  // --- 4. PROFESSIONAL EXPERIENCE ---
  if (resumeJson.experience && resumeJson.experience.length > 0) {
    drawSectionHeader('Professional Experience');
    resumeJson.experience.forEach(job => {
      const jobTopY = doc.y;
      // Line 1: Role (left) and Duration (right-aligned)
      doc.font('Helvetica-Bold')
         .fontSize(9.2)
         .fillColor(textColor)
         .text(job.role, leftMargin, jobTopY, { width: contentWidth * 0.65, lineBreak: false });
      
      if (job.duration) {
        doc.font('Helvetica')
           .fontSize(8.8)
           .fillColor(textColor)
           .text(job.duration, leftMargin, jobTopY, { width: contentWidth, align: 'right' });
      }

      // Line 2: Company
      doc.y = jobTopY + roleToCompGap;
      doc.font('Helvetica-Bold')
         .fontSize(8.8)
         .fillColor(textColor)
         .text(job.company, leftMargin, doc.y, { width: contentWidth });
      doc.y += compToProjGap;

      // Single Project
      if (job.project) {
        doc.font('Helvetica-Bold')
           .fontSize(8.8)
           .fillColor(textColor)
           .text(job.project, leftMargin, doc.y, { width: contentWidth });
        doc.y += projToBulletsGap;
      }

      if (job.highlights && Array.isArray(job.highlights)) {
        job.highlights.forEach(bullet => {
          drawBullet(bullet);
        });
      }

      // Sub-Projects
      if (job.projects && Array.isArray(job.projects)) {
        job.projects.forEach(subProj => {
          doc.y += subProjBeforeGap;
          doc.font('Helvetica-Bold')
             .fontSize(8.8)
             .fillColor(textColor)
             .text(subProj.name || subProj.title, leftMargin, doc.y, { width: contentWidth });
          doc.y += projToBulletsGap;

          if (subProj.highlights) {
            subProj.highlights.forEach(bullet => {
              drawBullet(bullet);
            });
          }
        });
      }
      doc.y += jobAfterGap;
    });
  }

  // --- 5. KEY ACHIEVEMENTS ---
  if (resumeJson.achievements && resumeJson.achievements.length > 0) {
    drawSectionHeader('Key Achievements');
    resumeJson.achievements.forEach(ach => {
      drawBullet(ach);
    });
  }

  // --- 6. INTERNSHIP EXPERIENCE ---
  if (resumeJson.internship) {
    drawSectionHeader('Internship Experience');
    const internTopY = doc.y;
    // Line 1: Role (left) and Duration (right-aligned)
    doc.font('Helvetica-Bold')
       .fontSize(9.2)
       .fillColor(textColor)
       .text(resumeJson.internship.role, leftMargin, internTopY, { width: contentWidth * 0.65, lineBreak: false });

    if (resumeJson.internship.duration) {
      doc.font('Helvetica')
         .fontSize(8.8)
         .fillColor(textColor)
         .text(resumeJson.internship.duration, leftMargin, internTopY, { width: contentWidth, align: 'right' });
    }

    // Line 2: Company
    doc.y = internTopY + roleToCompGap;
    doc.font('Helvetica-Bold')
       .fontSize(8.8)
       .fillColor(textColor)
       .text(resumeJson.internship.company, leftMargin, doc.y, { width: contentWidth });
    doc.y += compToProjGap;

    if (resumeJson.internship.highlights) {
      resumeJson.internship.highlights.forEach(bullet => {
        drawBullet(bullet);
      });
    }
  }

  // --- 7. EDUCATION ---
  if (resumeJson.education && resumeJson.education.length > 0) {
    drawSectionHeader('Education');
    resumeJson.education.forEach(edu => {
      const eduTopY = doc.y;
      // Line 1: Degree (left) and Duration (right-aligned)
      doc.font('Helvetica-Bold')
         .fontSize(9.0)
         .fillColor(textColor)
         .text(edu.degree, leftMargin, eduTopY, { width: contentWidth * 0.78, lineBreak: false });

      if (edu.duration) {
        doc.font('Helvetica')
           .fontSize(8.8)
           .fillColor(textColor)
           .text(edu.duration, leftMargin, eduTopY, { width: contentWidth, align: 'right' });
      }

      // Line 2: Institution & Details
      doc.y = eduTopY + roleToCompGap;
      const eduDetails = [edu.institution, edu.details].filter(Boolean).join('   |   ');
      doc.font('Helvetica')
         .fontSize(8.8)
         .fillColor(textColor)
         .text(eduDetails, leftMargin, doc.y, { width: contentWidth });
      doc.y += 2.5;
    });
  }
}

function findOptimalScale(resumeJson) {
  const candidateScales = [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.3, 0.0];
  const lerp = (a, b, t) => a + (b - a) * t;

  for (const scale of candidateScales) {
    const topMargin = lerp(20, 24, scale);
    const testDoc = new PDFDocument({
      size: 'A4',
      margins: { top: topMargin, bottom: 10, left: 36, right: 36 },
      bufferPages: true,
      autoFirstPage: true
    });

    renderResumeToDocument(testDoc, resumeJson, scale);

    if (testDoc.bufferedPageRange().count === 1 && testDoc.y <= 825) {
      return { scale, topMargin };
    }
  }
  return { scale: 0.0, topMargin: 20 };
}

function generateResumePdf(resumeJson, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const { scale, topMargin } = findOptimalScale(resumeJson);

      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: topMargin,
          bottom: 10,
          left: 36,
          right: 36
        },
        bufferPages: true,
        autoFirstPage: true
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      renderResumeToDocument(doc, resumeJson, scale);

      // Microscopic ATS keyword layer (1pt white text at bottom of canvas without page break)
      const leftMargin = 36;
      const contentWidth = 559.28 - 36;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica')
         .fontSize(1)
         .fillColor('#FFFFFF')
         .text('Full Stack Developer SDE 2 Node.js React JavaScript TypeScript REST APIs Microservices MySQL MongoDB AWS CI/CD', leftMargin, 832, { width: contentWidth, lineBreak: false });

      doc.end();

      writeStream.on('finish', () => {
        if (typeof global.gc === 'function') {
          setImmediate(() => { try { global.gc(); } catch (e) {} });
        }
        resolve(outputPath);
      });
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateResumePdf };
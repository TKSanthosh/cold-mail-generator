const PDFDocument = require('pdfkit');
const fs = require('fs');

/**
 * Generates an executive, perfectly fitted 1-Page ATS-compliant PDF Resume matching Santhosh's exact typography and styling.
 * Balanced to gracefully fill the entire A4 page canvas from top to bottom with zero blank gaps and zero spillover.
 */
function generateResumePdf(resumeJson, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 20,
          bottom: 12,
          left: 36,
          right: 36
        },
        bufferPages: true,
        autoFirstPage: true
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const textColor = '#000000';
      const grayLineColor = '#333333';
      const leftMargin = 36;
      const rightMargin = 559.28; // 595.28 - 36
      const contentWidth = rightMargin - leftMargin; // 523.28

      function drawSectionHeader(title) {
        doc.y += 4.0;
        doc.font('Helvetica-Bold')
           .fontSize(9.2)
           .fillColor(textColor)
           .text(title.toUpperCase(), leftMargin, doc.y, { width: contentWidth });
        
        const lineY = doc.y + 1.5;
        doc.strokeColor(grayLineColor)
           .lineWidth(0.6)
           .moveTo(leftMargin, lineY)
           .lineTo(rightMargin, lineY)
           .stroke();
        
        doc.y = lineY + 2.5;
      }

      function drawBullet(text, bulletSize = 8.5, lineGap = 1.2) {
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
             lineGap: lineGap
           });
        doc.y += 1.2;
      }

      // --- 1. HEADER (Centered Name & 2-Column Contact Info) ---
      const info = resumeJson.personalInfo || {};

      doc.font('Helvetica-Bold')
         .fontSize(15.5)
         .fillColor(textColor)
         .text((info.name || 'SANTHOSH T K').toUpperCase(), leftMargin, 20, { align: 'center', width: contentWidth });

      doc.y += 3;
      const headerTopY = doc.y;
      const rowHeight = 11;
      const rightColX = 320;

      // Row 1: Location & Phone
      doc.font('Helvetica-Bold').fontSize(8.8).fillColor(textColor).text('Location: ', leftMargin, headerTopY, { continued: true });
      doc.font('Helvetica').fontSize(8.8).text(info.location || 'Bangalore');

      doc.font('Helvetica-Bold').fontSize(8.8).fillColor(textColor).text('Phone: ', rightColX, headerTopY, { continued: true });
      doc.font('Helvetica').fontSize(8.8).text(info.phone || '+91 8825802707');

      // Row 2: Email & LinkedIn
      doc.font('Helvetica-Bold').fontSize(8.8).fillColor(textColor).text('Email: ', leftMargin, headerTopY + rowHeight, { continued: true });
      doc.font('Helvetica').fontSize(8.8).text(info.email || 'tksanthosh494@gmail.com');

      doc.font('Helvetica-Bold').fontSize(8.8).fillColor(textColor).text('LinkedIn: ', rightColX, headerTopY + rowHeight, { continued: true });
      doc.font('Helvetica').fontSize(8.8).text(info.linkedin || 'linkedin.com/in/santhosh-tk');

      // Row 3: Portfolio & GitHub
      doc.font('Helvetica-Bold').fontSize(8.8).fillColor(textColor).text('Portfolio: ', leftMargin, headerTopY + (rowHeight * 2), { continued: true });
      doc.font('Helvetica').fontSize(8.8).text(info.portfolio || 'https://santhoshtk-portfolio.netlify.app/');

      doc.font('Helvetica-Bold').fontSize(8.8).fillColor(textColor).text('GitHub: ', rightColX, headerTopY + (rowHeight * 2), { continued: true });
      doc.font('Helvetica').fontSize(8.8).text(info.github || 'github.com/TKSanthosh');

      doc.y = headerTopY + (rowHeight * 2) + 9;

      // --- 2. PROFILE SUMMARY ---
      if (resumeJson.summary) {
        drawSectionHeader('Profile Summary');
        doc.font('Helvetica')
           .fontSize(8.6)
           .fillColor(textColor)
           .text(resumeJson.summary, leftMargin, doc.y, {
             width: contentWidth,
             align: 'left',
             lineGap: 1.3
           });
        doc.y += 1.5;
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
             .text(listStr, { width: contentWidth, lineGap: 1.2 });
          doc.y += 1.0;
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
          doc.y = jobTopY + 11.8;
          doc.font('Helvetica-Bold')
             .fontSize(8.8)
             .fillColor(textColor)
             .text(job.company, leftMargin, doc.y, { width: contentWidth });
          doc.y += 1.8;

          // Single Project
          if (job.project) {
            doc.font('Helvetica-Bold')
               .fontSize(8.8)
               .fillColor(textColor)
               .text(job.project, leftMargin, doc.y, { width: contentWidth });
            doc.y += 1.8;
          }

          if (job.highlights && Array.isArray(job.highlights)) {
            job.highlights.forEach(bullet => {
              drawBullet(bullet);
            });
          }

          // Sub-Projects
          if (job.projects && Array.isArray(job.projects)) {
            job.projects.forEach(subProj => {
              doc.font('Helvetica-Bold')
                 .fontSize(8.8)
                 .fillColor(textColor)
                 .text(subProj.name || subProj.title, leftMargin, doc.y, { width: contentWidth });
              doc.y += 1.8;

              if (subProj.highlights) {
                subProj.highlights.forEach(bullet => {
                  drawBullet(bullet);
                });
              }
            });
          }
          doc.y += 1.8;
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
        doc.y = internTopY + 11.8;
        doc.font('Helvetica-Bold')
           .fontSize(8.8)
           .fillColor(textColor)
           .text(resumeJson.internship.company, leftMargin, doc.y, { width: contentWidth });
        doc.y += 1.8;

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
          doc.y = eduTopY + 11.8;
          const eduDetails = [edu.institution, edu.details].filter(Boolean).join('   |   ');
          doc.font('Helvetica')
             .fontSize(8.8)
             .fillColor(textColor)
             .text(eduDetails, leftMargin, doc.y, { width: contentWidth });
          doc.y += 2;
        });
      }

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
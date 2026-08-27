const PDFDocument = require('pdfkit');
const fs = require('fs');

/**
 * Generates an exact replica of Santhosh's professional resume layout in PDF format.
 * Matches original typography, full-width margins, 2-column contact header, section rules, and bullet spacing.
 */
function generateResumePdf(resumeJson, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 36,
          bottom: 36,
          left: 54,
          right: 54
        },
        autoFirstPage: true
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const textColor = '#000000';
      const grayLineColor = '#333333';
      const leftMargin = 54;
      const rightMargin = 541; // A4 width 595 - 54
      const contentWidth = rightMargin - leftMargin; // 487

      function drawSectionHeader(title) {
        doc.x = leftMargin;
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold')
           .fontSize(10.5)
           .fillColor(textColor)
           .text(title.toUpperCase(), leftMargin, doc.y, { width: contentWidth });
        
        const lineY = doc.y + 1;
        doc.strokeColor(grayLineColor)
           .lineWidth(0.75)
           .moveTo(leftMargin, lineY)
           .lineTo(rightMargin, lineY)
           .stroke();
        
        doc.y = lineY + 5;
        doc.x = leftMargin;
      }

      // --- 1. HEADER (Candidate Name & 2-Column Contact Info) ---
      const info = resumeJson.personalInfo || {};
      
      // Name (Centered, Bold, 16pt)
      doc.font('Helvetica-Bold')
         .fontSize(16)
         .fillColor(textColor)
         .text((info.name || 'SANTHOSH T K').toUpperCase(), leftMargin, doc.y, { align: 'center', width: contentWidth });
      doc.moveDown(0.4);

      // Contact Table (2 columns)
      const headerTopY = doc.y;

      // Left Column (Location, Email, Portfolio)
      doc.font('Helvetica-Bold').fontSize(9).fillColor(textColor).text('Location: ', leftMargin, headerTopY, { continued: true });
      doc.font('Helvetica').text(info.location || 'Bangalore');

      doc.font('Helvetica-Bold').fontSize(9).text('Email: ', leftMargin, doc.y, { continued: true });
      doc.font('Helvetica').text(info.email || 'tksanthosh494@gmail.com');

      if (info.portfolio) {
        doc.font('Helvetica-Bold').fontSize(9).text('Portfolio: ', leftMargin, doc.y, { continued: true });
        doc.font('Helvetica').text(info.portfolio);
      }

      // Right Column (Phone, LinkedIn, GitHub)
      const rightColX = 310;
      doc.font('Helvetica-Bold').fontSize(9).text('Phone: ', rightColX, headerTopY, { continued: true });
      doc.font('Helvetica').text(info.phone || '+91 8825802707');

      doc.font('Helvetica-Bold').fontSize(9).text('LinkedIn: ', rightColX, doc.y, { continued: true });
      doc.font('Helvetica').text(info.linkedin || 'linkedin.com/in/santhosh-tk');

      doc.font('Helvetica-Bold').fontSize(9).text('GitHub: ', rightColX, doc.y, { continued: true });
      doc.font('Helvetica').text(info.github || 'github.com/TKSanthosh');

      // Reset X coordinate and advance Y
      doc.y = headerTopY + 44;
      doc.x = leftMargin;

      // --- 2. PROFILE SUMMARY ---
      if (resumeJson.summary) {
        drawSectionHeader('Profile Summary');
        doc.font('Helvetica')
           .fontSize(9.5)
           .fillColor(textColor)
           .text(resumeJson.summary, leftMargin, doc.y, {
             width: contentWidth,
             align: 'left',
             lineGap: 2.2
           });
      }

      // --- 3. TECHNICAL SKILLS ---
      if (resumeJson.skills && Object.keys(resumeJson.skills).length > 0) {
        drawSectionHeader('Technical Skills');
        Object.entries(resumeJson.skills).forEach(([category, skillsList]) => {
          const listStr = Array.isArray(skillsList) ? skillsList.join(', ') : skillsList;
          doc.x = leftMargin;
          doc.font('Helvetica-Bold')
             .fontSize(9.5)
             .fillColor(textColor)
             .text(category, leftMargin, doc.y, { width: contentWidth });
          
          doc.font('Helvetica')
             .fontSize(9)
             .fillColor(textColor)
             .text(listStr, leftMargin, doc.y, { width: contentWidth, lineGap: 1.5 });
          doc.moveDown(0.3);
        });
      }

      // --- 4. PROFESSIONAL EXPERIENCE ---
      if (resumeJson.experience && resumeJson.experience.length > 0) {
        drawSectionHeader('Professional Experience');
        resumeJson.experience.forEach(job => {
          doc.x = leftMargin;
          // Role Title
          doc.font('Helvetica-Bold')
             .fontSize(10)
             .fillColor(textColor)
             .text(job.role, leftMargin, doc.y, { width: contentWidth });

          // Company & Location
          doc.font('Helvetica-Bold')
             .fontSize(9.5)
             .fillColor(textColor)
             .text(job.company, leftMargin, doc.y, { width: contentWidth });

          // Duration
          if (job.duration) {
            doc.font('Helvetica')
               .fontSize(9)
               .fillColor(textColor)
               .text(job.duration, leftMargin, doc.y, { width: contentWidth });
          }
          doc.moveDown(0.25);

          // Single Project or Direct Highlights
          if (job.project) {
            doc.font('Helvetica-Bold')
               .fontSize(9.5)
               .fillColor(textColor)
               .text(job.project, leftMargin, doc.y, { width: contentWidth });
            doc.moveDown(0.15);
          }

          if (job.highlights && Array.isArray(job.highlights)) {
            job.highlights.forEach(bullet => {
              doc.font('Helvetica')
                 .fontSize(9)
                 .fillColor(textColor)
                 .text(`•   ${bullet}`, leftMargin, doc.y, { indent: 14, width: contentWidth, lineGap: 1.8 });
              doc.moveDown(0.1);
            });
            doc.moveDown(0.25);
          }

          // Multiple Sub-Projects (like in Sify Technologies)
          if (job.projects && Array.isArray(job.projects)) {
            job.projects.forEach(subProj => {
              doc.x = leftMargin;
              doc.font('Helvetica-Bold')
                 .fontSize(9.5)
                 .fillColor(textColor)
                 .text(subProj.name || subProj.title, leftMargin, doc.y, { width: contentWidth });
              doc.moveDown(0.15);

              if (subProj.highlights) {
                subProj.highlights.forEach(bullet => {
                  doc.font('Helvetica')
                     .fontSize(9)
                     .fillColor(textColor)
                     .text(`•   ${bullet}`, leftMargin, doc.y, { indent: 14, width: contentWidth, lineGap: 1.8 });
                  doc.moveDown(0.1);
                });
              }
              doc.moveDown(0.25);
            });
          }
        });
      }

      // --- 5. KEY ACHIEVEMENTS ---
      if (resumeJson.achievements && resumeJson.achievements.length > 0) {
        drawSectionHeader('Key Achievements');
        resumeJson.achievements.forEach(ach => {
          doc.x = leftMargin;
          doc.font('Helvetica')
             .fontSize(9)
             .fillColor(textColor)
             .text(`•   ${ach}`, leftMargin, doc.y, { indent: 14, width: contentWidth, lineGap: 1.8 });
          doc.moveDown(0.15);
        });
      }

      // --- 6. INTERNSHIP EXPERIENCE ---
      if (resumeJson.internship) {
        drawSectionHeader('Internship Experience');
        doc.x = leftMargin;
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .fillColor(textColor)
           .text(resumeJson.internship.role, leftMargin, doc.y, { width: contentWidth });

        doc.font('Helvetica-Bold')
           .fontSize(9.5)
           .fillColor(textColor)
           .text(resumeJson.internship.company, leftMargin, doc.y, { width: contentWidth });

        if (resumeJson.internship.duration) {
          doc.font('Helvetica')
             .fontSize(9)
             .fillColor(textColor)
             .text(resumeJson.internship.duration, leftMargin, doc.y, { width: contentWidth });
        }
        doc.moveDown(0.2);

        if (resumeJson.internship.highlights) {
          resumeJson.internship.highlights.forEach(bullet => {
            doc.font('Helvetica')
               .fontSize(9)
               .fillColor(textColor)
               .text(`•   ${bullet}`, leftMargin, doc.y, { indent: 14, width: contentWidth, lineGap: 1.8 });
            doc.moveDown(0.1);
          });
        }
      }

      // --- 7. EDUCATION ---
      if (resumeJson.education && resumeJson.education.length > 0) {
        drawSectionHeader('Education');
        resumeJson.education.forEach(edu => {
          doc.x = leftMargin;
          doc.font('Helvetica-Bold')
             .fontSize(9.5)
             .fillColor(textColor)
             .text(edu.degree, leftMargin, doc.y, { width: contentWidth });

          doc.font('Helvetica')
             .fontSize(9)
             .fillColor(textColor)
             .text(edu.institution, leftMargin, doc.y, { width: contentWidth });

          const eduMeta = [edu.duration, edu.details].filter(Boolean).join(' | ');
          if (eduMeta) {
            doc.font('Helvetica')
               .fontSize(9)
               .fillColor(textColor)
               .text(eduMeta, leftMargin, doc.y, { width: contentWidth });
          }
          doc.moveDown(0.15);
        });
      }

      doc.end();

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateResumePdf };
